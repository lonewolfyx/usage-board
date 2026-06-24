import type { AgentAdapter, UsageInteractionFact } from '#server/agents/shared/fact'
import type { ProjectUsagePlatform, ProjectUsagePlatformRecord } from '#shared/types/ai'
import type { IConfig } from '#shared/types/config'
import type {
    ProjectUsageDataModuleResponse,
    ProjectUsageDataModulesResponse,
    ProjectWebSocketRequest,
} from '#shared/types/ws'
import type { FSWatcher } from 'chokidar'
import { accessSync, constants } from 'node:fs'
import { join } from 'node:path'
import { createAgentAdapters, getAgentAdapterForPlatform } from '#server/agents/registry'
import { buildDashboardState, buildHomeModules, buildProjectModules } from '#server/aggregate/dashboard'
import { UsageFactRepository } from '#server/cache/fact-repository'
import { preparePricingSnapshot } from '#server/pricing/snapshot'
import { UsageRuntimeConsoleReporter } from '#server/runtime/usage-reporter'
import { buildSourceChangeSet } from '#server/sources/change-set'
import { createEmptyLoadUsageResult } from '#shared/platform/defaults'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'
import { useDateFormat } from '#shared/utils/date'
import chokidar from 'chokidar'

const WATCHER_DEBOUNCE_MS = 350

interface UsageRuntimeUpdate {
    affectedProjects: string[]
    updatedAt: string
    updatedPlatforms: readonly ProjectUsagePlatform[]
    updatedSessions: Array<{ platform: ProjectUsagePlatform, repository: string, sessionId: string }>
}

export class UsageDataRuntime {
    private readonly adapters: ProjectUsagePlatformRecord<AgentAdapter>
    private readonly repository: UsageFactRepository
    private dashboardState: ReturnType<typeof buildDashboardState> | null = null
    private initializePromise: Promise<void> | null = null
    private refreshPromise: Promise<void> | null = null
    private readonly updateListeners = new Set<(update: UsageRuntimeUpdate) => void>()
    private watcher: FSWatcher | null = null
    private watcherTimer: ReturnType<typeof setTimeout> | null = null

    constructor(private readonly config: IConfig) {
        this.adapters = createAgentAdapters(config)
        this.repository = new UsageFactRepository(resolveUsageCachePath(config))
    }

    async initialize() {
        if (!this.initializePromise) {
            this.initializePromise = (async () => {
                const pricingSnapshot = preparePricingSnapshot()
                const resolvePricing = await pricingSnapshot
                this.dashboardState = buildDashboardState(this.config.version, this.repository.loadFacts(), resolvePricing)
                this.startWatcher()
            })()
        }

        return this.initializePromise
    }

    async ensureFreshBootstrapForStartup() {
        await this.refreshNow()
    }

    async getBootstrap() {
        await this.ensureReady()
        return this.dashboardState!.bootstrap
    }

    async getAgentDashboard(platform: ProjectUsagePlatform) {
        await this.ensureReady()
        return this.dashboardState!.bootstrap[platform] ?? createEmptyLoadUsageResult()
    }

    async getHomeDashboardModules() {
        await this.ensureReady()
        return buildHomeModules(this.dashboardState!)
    }

    async getProjectCatalog() {
        await this.ensureReady()
        return this.dashboardState!.projectCatalog
    }

    async getProjectDataModules(
        request: Pick<Extract<ProjectWebSocketRequest, { type: 'project_data' }>, 'module' | 'modules' | 'page' | 'pageSize' | 'platform' | 'project'>,
    ): Promise<ProjectUsageDataModuleResponse | ProjectUsageDataModulesResponse | null> {
        await this.ensureReady()
        return buildProjectModules(this.dashboardState!, {
            ...request,
            project: request.project ?? '',
        })
    }

    async getLiveState() {
        await this.ensureReady()
        const sourceFiles = this.repository.loadSourceFiles()
        const latestMtime = sourceFiles.reduce((latest, source) => Math.max(latest, source.mtimeMs), 0)

        return {
            updatedAt: latestMtime > 0
                ? (useDateFormat(latestMtime, 'iso') ?? new Date(latestMtime).toISOString())
                : '',
        }
    }

    subscribeToUpdates(listener: (update: UsageRuntimeUpdate) => void) {
        this.updateListeners.add(listener)
        return () => this.updateListeners.delete(listener)
    }

    dispose() {
        if (this.watcherTimer) {
            clearTimeout(this.watcherTimer)
            this.watcherTimer = null
        }

        if (this.watcher) {
            const watcher = this.watcher
            this.watcher = null
            void watcher.close()
        }

        this.repository.close()
    }

    private async ensureReady() {
        await this.initialize()

        if (!this.dashboardState || this.repository.loadFacts().length === 0) {
            await this.refreshNow()
        }
    }

    private async refreshNow() {
        if (!this.refreshPromise) {
            this.refreshPromise = this.refresh().finally(() => {
                this.refreshPromise = null
            })
        }

        return this.refreshPromise
    }

    private async refresh() {
        await this.initialize()

        const reporter = new UsageRuntimeConsoleReporter()
        const startedAt = Date.now()
        let sourceDiscoveryMs = 0
        let parseMs = 0
        let writeMs = 0

        reporter.start()

        try {
            const cachedSources = this.repository.loadSourceFiles()
            const discoveryStartedAt = Date.now()
            const discoveredSources = await this.discoverSources()
            const changeSet = buildSourceChangeSet(discoveredSources, cachedSources)
            sourceDiscoveryMs = Date.now() - discoveryStartedAt
            const changedPlatforms = new Set<ProjectUsagePlatform>([
                ...changeSet.changedSources.map(source => source.platform),
                ...changeSet.removedSources.map(source => source.platform),
            ])
            const updatedPlatforms = PROJECT_USAGE_PLATFORMS.filter(platform => changedPlatforms.has(platform))

            reporter.foundSources({
                cachedFiles: cachedSources.length,
                changedFiles: changeSet.changedSources.length,
                discoveredFiles: discoveredSources.length,
                removedFiles: changeSet.removedSources.length,
                updatedPlatforms,
            })

            if (!changeSet.hasChanges && this.dashboardState) {
                return
            }

            const parseStartedAt = Date.now()
            const loaded = await Promise.all(changeSet.changedSources.map(source => getAgentAdapterForPlatform(this.adapters, source.platform).loadSource(source)))
            parseMs = Date.now() - parseStartedAt
            const facts = loaded.flatMap(result => result.facts)
            const affectedProjects = Array.from(new Set(facts.map(fact => fact.project))).sort((left, right) => left.localeCompare(right))
            const sourceCountByPlatform = changeSet.changedSources.reduce((counts, source) => {
                counts.set(source.platform, (counts.get(source.platform) ?? 0) + 1)
                return counts
            }, new Map<ProjectUsagePlatform, number>())

            for (const platform of updatedPlatforms) {
                const platformFacts = facts.filter(fact => fact.platform === platform)
                reporter.finishPlatform(platform, {
                    durationMs: parseMs,
                    facts: platformFacts,
                    parsedFiles: sourceCountByPlatform.get(platform) ?? 0,
                })
            }

            const writeStartedAt = Date.now()
            this.repository.replaceSourceFacts({
                changedSources: changeSet.changedSources,
                facts,
                removedSourcePaths: changeSet.removedSources.map(source => source.path),
            })
            writeMs = Date.now() - writeStartedAt

            this.dashboardState = buildDashboardState(this.config.version, this.repository.loadFacts(), await preparePricingSnapshot())
            const updatedSessions = collectUpdatedSessions(facts)

            reporter.finishCacheWrite({
                durationMs: writeMs,
                factCount: this.repository.loadFacts().length,
                projectCount: this.dashboardState.projectCatalog.length,
                sourceFileCount: discoveredSources.length,
                updatedSessions,
            })

            this.emitUpdate({
                affectedProjects,
                updatedAt: new Date().toISOString(),
                updatedPlatforms,
                updatedSessions,
            })

            reporter.complete({
                durationMs: Date.now() - startedAt,
                parseMs,
                sourceDiscoveryMs,
                writeMs,
            })
        }
        catch (error) {
            reporter.fail(error)
            throw error
        }
    }

    private async discoverSources() {
        const groups = await Promise.all(PROJECT_USAGE_PLATFORMS.map(platform => this.adapters[platform].discoverSources()))

        return groups.flat().sort((left, right) => left.path.localeCompare(right.path))
    }

    private startWatcher() {
        if (this.watcher) {
            return
        }

        const watchPatterns = PROJECT_USAGE_PLATFORMS.flatMap(platform => this.adapters[platform].watchSourcePatterns())

        this.watcher = chokidar.watch(watchPatterns, {
            awaitWriteFinish: {
                pollInterval: 100,
                stabilityThreshold: 250,
            },
            ignoreInitial: true,
            persistent: true,
        })

        this.watcher
            .on('add', () => this.scheduleRefresh())
            .on('change', () => this.scheduleRefresh())
            .on('unlink', () => this.scheduleRefresh())
            .on('error', (error: unknown) => console.error('[usage-runtime] watcher error', error))
    }

    private scheduleRefresh() {
        if (this.watcherTimer) {
            clearTimeout(this.watcherTimer)
        }

        this.watcherTimer = setTimeout(() => {
            this.watcherTimer = null
            this.refreshNow().catch(error => console.error('[usage-runtime] background refresh failed', error))
        }, WATCHER_DEBOUNCE_MS)
    }

    private emitUpdate(update: UsageRuntimeUpdate) {
        for (const listener of this.updateListeners) {
            try {
                listener(update)
            }
            catch (error) {
                console.error('[usage-runtime] update listener failed', error)
            }
        }
    }
}

let usageDataRuntime: UsageDataRuntime | null = null

export function getUsageDataRuntime(config: IConfig) {
    if (!usageDataRuntime) {
        usageDataRuntime = new UsageDataRuntime(config)
    }

    return usageDataRuntime
}

function resolveUsageCachePath(config: IConfig) {
    try {
        accessSync(config.home, constants.W_OK)
        return join(config.home, '.usage-board', 'cache.sqlite')
    }
    catch {
        return join(process.cwd(), '.data', 'usage-board', 'cache.sqlite')
    }
}

function collectUpdatedSessions(facts: UsageInteractionFact[]) {
    const sessions = new Map<string, { platform: ProjectUsagePlatform, repository: string, sessionId: string }>()

    for (const fact of facts) {
        sessions.set(JSON.stringify([fact.platform, fact.repository, fact.sessionId]), {
            platform: fact.platform,
            repository: fact.repository,
            sessionId: fact.sessionId,
        })
    }

    return Array.from(sessions.values())
}
