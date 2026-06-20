import type { DiscoveredUsageFile } from '#server/services/usage-indexer/platform-adapter'
import type { IndexedUsageSourceFile, IndexedUsageSourceFileMeta, UpdatedUsageSession } from '#server/types/usage-indexer'
import type { ProjectUsagePlatform, ProjectUsagePlatformRecord } from '#shared/types/ai'
import type { AgentDashboardModules, AgentDashboardModulesResponse, HomeDashboardModules, HomeDashboardModulesResponse } from '#shared/types/analysis'
import type { IConfig } from '#shared/types/config'
import type { UsageAggregateEvent } from '#shared/types/platform'
import type { ProjectSessionUsageItem, ProjectUsageDetail, TokensConsumptionResult } from '#shared/types/usage-dashboard'
import type {
    ProjectUsageCatalogItem,
    ProjectUsageDataModuleResponse,
    ProjectUsageDataModulesResponse,
    ProjectWebSocketRequest,
} from '#shared/types/ws'
import type { PaginationInput } from '#shared/utils/pagination'
import type { FSWatcher } from 'chokidar'
import { accessSync, constants, promises as fsPromises } from 'node:fs'
import { join } from 'node:path'
import { UsageCacheRepository } from '#server/repositories/sqlite/usage-cache.repository'
import { UsageCleaningConsoleReporter } from '#server/services/usage-cleaning-reporter'
import {
    buildEventsByPlatformFromFiles,
    buildIncrementalUsageIndex,
    buildPlatformSessionsByPlatform,
    getUsageCacheUpdateState,
    hydrateIndexedUsageSourceFiles,
} from '#server/services/usage-indexer'
import { usagePlatformAdapters } from '#server/services/usage-indexer/adapters'
import { createEmptyLoadUsageResult } from '#shared/platform/defaults'
import { resetRemotePricingCache } from '#shared/platform/pricing'
import {
    buildProjectLoadUsageResult,
    buildProjectUsageDataModuleFromDetail,
    buildProjectUsageDetailFromPlatformSessions,
} from '#shared/platform/project'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'
import { buildAgentDashboardModules, buildHomeDashboardModules } from '#shared/utils/analysis-dashboard'
import { useDateFormat } from '#shared/utils/date'
import { log } from '@clack/prompts'
import chokidar from 'chokidar'

const WATCHER_DEBOUNCE_MS = 350
const LIVE_PRICING_BOOTSTRAP_DEDUPE_MS = 1000

export interface UsageRuntimeUpdate {
    affectedProjects: string[]
    updatedAt: string
    updatedPlatforms: readonly ProjectUsagePlatform[]
    updatedSessions: UpdatedUsageSession[]
}

interface UsageRuntimeState {
    bootstrap: TokensConsumptionResult | null
    discoveredFiles: DiscoveredUsageFile[] | null
    eventsByPlatform: Partial<ProjectUsagePlatformRecord<UsageAggregateEvent[]>> | null
    hasIndexedCurrentProcess: boolean
    hasLoadedAllProjectDetails: boolean
    hydratedAt: number
    indexedFiles: IndexedUsageSourceFile[] | null
    indexedFileMetas: IndexedUsageSourceFileMeta[] | null
    projectCatalog: ProjectUsageCatalogItem[]
    projectDetails: Map<string, ProjectUsageDetail> | null
    refreshStartedAt: number
}

export class UsageDataRuntime {
    private readonly repository: UsageCacheRepository
    private readonly state: UsageRuntimeState = {
        bootstrap: null,
        discoveredFiles: null,
        eventsByPlatform: null,
        hasIndexedCurrentProcess: false,
        hasLoadedAllProjectDetails: false,
        hydratedAt: 0,
        indexedFiles: null,
        indexedFileMetas: null,
        projectCatalog: [],
        projectDetails: null,
        refreshStartedAt: 0,
    }

    private initializePromise: Promise<void> | null = null
    private liveBootstrap: TokensConsumptionResult | null = null
    private liveBootstrapFetchedAt = 0
    private liveBootstrapPromise: Promise<TokensConsumptionResult> | null = null
    private pendingWatcherPaths = new Map<string, 'add' | 'change' | 'unlink'>()
    private refreshPromise: Promise<void> | null = null
    private refreshRequestedWhileBusy = false
    private readonly updateListeners = new Set<(update: UsageRuntimeUpdate) => void>()
    private watcher: FSWatcher | null = null
    private watcherDebounceTimer: ReturnType<typeof setTimeout> | null = null

    constructor(private readonly config: IConfig) {
        const databasePath = resolveUsageCachePath(config)
        this.repository = new UsageCacheRepository(databasePath)
    }

    async initialize() {
        if (!this.initializePromise) {
            this.initializePromise = (async () => {
                const indexedFileMetas = this.repository.loadSourceFileMetas()
                const cachedPlatformSessions = this.repository.querySessionSummariesByPlatform(PROJECT_USAGE_PLATFORMS)
                const cachedEventsByPlatform = this.repository.queryInteractionEventsByPlatform()
                const bootstrapByPlatform = PROJECT_USAGE_PLATFORMS.reduce<ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>>((result, platform) => {
                    result[platform] = cachedPlatformSessions.get(platform) ?? []
                    return result
                }, {} as ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>)
                const eventsByPlatform = PROJECT_USAGE_PLATFORMS.reduce<ProjectUsagePlatformRecord<UsageAggregateEvent[]>>((result, platform) => {
                    result[platform] = cachedEventsByPlatform.get(platform) ?? []
                    return result
                }, {} as ProjectUsagePlatformRecord<UsageAggregateEvent[]>)

                this.state.bootstrap = buildBootstrapFromPlatformSessions(this.config.version, bootstrapByPlatform, eventsByPlatform)
                this.state.discoveredFiles = indexedFileMetas.map(({ cacheSignature, mtimeMs, path, platform, size }) => ({
                    cacheSignature,
                    mtimeMs,
                    path,
                    platform,
                    size,
                }))
                this.state.eventsByPlatform = eventsByPlatform
                this.state.hasIndexedCurrentProcess = false
                this.state.indexedFiles = null
                this.state.indexedFileMetas = indexedFileMetas
                this.state.projectCatalog = buildProjectCatalogFromPlatformSessions(bootstrapByPlatform)
                this.state.projectDetails = null
                this.state.hasLoadedAllProjectDetails = false
                this.state.hydratedAt = indexedFileMetas.reduce((latest, file) => {
                    const updatedAt = Date.parse(file.updatedAt)

                    return Number.isFinite(updatedAt) && updatedAt > latest
                        ? updatedAt
                        : latest
                }, 0)
            })()
                .finally(() => {
                    this.startWatcher()
                })
        }

        return this.initializePromise
    }

    async getBootstrap() {
        await this.ensureHydratedCurrentProcessState()

        if (this.liveBootstrap) {
            return this.liveBootstrap
        }

        if (this.state.bootstrap) {
            if (this.state.indexedFiles) {
                this.refreshLiveBootstrapInBackground()
            }
            return this.state.bootstrap
        }

        return this.getLiveBootstrap()
    }

    async ensureFreshBootstrapForStartup(options: {
        verboseWhenChanged?: boolean
    } = {}) {
        await this.initialize()
        const shouldLogStartupScan = options.verboseWhenChanged !== false

        if (shouldLogStartupScan) {
            log.step('正在读取 AI Coding 会话记录...')
        }

        const updateState = await getUsageCacheUpdateState(
            this.config,
            this.repository,
            this.state.hydratedAt,
            this.state.indexedFileMetas ?? undefined,
        )

        if (this.state.bootstrap && !updateState.hasChanges) {
            this.state.discoveredFiles = updateState.discoveredFiles
            this.state.hasIndexedCurrentProcess = true

            if (shouldLogStartupScan) {
                log.info(`查找到 ${updateState.discoveredFiles.length} 个会话记录文件，cache.sqlite 已命中 ${updateState.cachedFiles} 个，无需重新解析源文件`)
            }
            return
        }

        const updatedPlatforms = updateState.updatedPlatforms.length > 0
            ? updateState.updatedPlatforms
            : PROJECT_USAGE_PLATFORMS

        await this.refreshNow({
            discoveredFiles: updateState.discoveredFiles,
            forceLog: !this.state.bootstrap || (options.verboseWhenChanged !== false && updateState.hasChanges),
            hydrateCachedPricing: !this.state.bootstrap,
            updatedPlatforms,
        })
    }

    async getProjectCatalog() {
        await this.ensureHydratedCurrentProcessState()

        return this.state.projectCatalog
    }

    async getAgentDashboard(platform: ProjectUsagePlatform) {
        const bootstrap = await this.getBootstrap()

        return bootstrap[platform] ?? createEmptyLoadUsageResult()
    }

    async getAgentDashboardModules(platform: ProjectUsagePlatform, pagination?: PaginationInput): Promise<AgentDashboardModules> {
        return buildAgentDashboardModules(await this.getAgentDashboard(platform), pagination)
    }

    async getAgentDashboardModuleSnapshot(platform: ProjectUsagePlatform, pagination?: PaginationInput): Promise<AgentDashboardModulesResponse> {
        const modules = await this.getAgentDashboardModules(platform, pagination)

        return {
            ...modules,
            updatedAt: this.state.hydratedAt > 0
                ? (useDateFormat(this.state.hydratedAt, 'iso') ?? new Date(this.state.hydratedAt).toISOString())
                : '',
        }
    }

    async getHomeDashboardModules(): Promise<HomeDashboardModules> {
        return buildHomeDashboardModules(await this.getBootstrap())
    }

    async getHomeDashboardModuleSnapshot(): Promise<HomeDashboardModulesResponse> {
        const modules = await this.getHomeDashboardModules()

        return {
            ...modules,
            updatedAt: this.state.hydratedAt > 0
                ? (useDateFormat(this.state.hydratedAt, 'iso') ?? new Date(this.state.hydratedAt).toISOString())
                : '',
        }
    }

    async getLiveState() {
        await this.ensureHydratedCurrentProcessState()

        return {
            updatedAt: this.state.hydratedAt > 0
                ? (useDateFormat(this.state.hydratedAt, 'iso') ?? new Date(this.state.hydratedAt).toISOString())
                : '',
        }
    }

    async getProjectDataModules(
        request: Pick<Extract<ProjectWebSocketRequest, { type: 'project_data' }>, 'module' | 'modules' | 'page' | 'pageSize' | 'platform' | 'project'>,
    ): Promise<ProjectUsageDataModuleResponse | ProjectUsageDataModulesResponse | null> {
        const projectLabel = (request.project || '').trim()

        if (!projectLabel) {
            throw new Error('Missing project name for project data request.')
        }

        let hydratedDetail = this.getProjectDetailFromRepository(projectLabel)

        if (!hydratedDetail) {
            await this.refreshNow()
            hydratedDetail = this.getProjectDetailFromRepository(projectLabel)
        }

        if (!hydratedDetail) {
            return null
        }

        return buildProjectUsageDataModuleFromDetail(hydratedDetail, {
            module: request.module,
            modules: request.modules,
            page: request.page,
            pageSize: request.pageSize,
            platform: request.platform,
        })
    }

    private async getLiveBootstrap() {
        const now = Date.now()

        if (this.liveBootstrap && now - this.liveBootstrapFetchedAt < LIVE_PRICING_BOOTSTRAP_DEDUPE_MS) {
            return this.liveBootstrap
        }

        if (this.liveBootstrapPromise) {
            return this.liveBootstrapPromise
        }

        this.liveBootstrapPromise = this.buildLiveBootstrap()
            .finally(() => {
                this.liveBootstrapPromise = null
            })

        return this.liveBootstrapPromise
    }

    private getProjectDetailFromRepository(projectName: string) {
        const bootstrap = this.state.bootstrap

        if (!bootstrap) {
            return null
        }

        const platformSessions = Object.fromEntries(
            PROJECT_USAGE_PLATFORMS.map(platform => [
                platform,
                (bootstrap[platform].sessionUsage as ProjectSessionUsageItem[]).filter(session => session.project === projectName),
            ]),
        ) as ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>

        const hasSessions = PROJECT_USAGE_PLATFORMS.some(platform => platformSessions[platform].length > 0)

        if (!hasSessions) {
            return null
        }

        const eventsByPlatform = Object.fromEntries(
            PROJECT_USAGE_PLATFORMS.map(platform => [
                platform,
                (this.state.eventsByPlatform?.[platform] ?? []).filter(event => event.project === projectName),
            ]),
        ) as ProjectUsagePlatformRecord<UsageAggregateEvent[]>

        return buildProjectUsageDetailFromPlatformSessions(projectName, platformSessions, eventsByPlatform)
    }

    private refreshLiveBootstrapInBackground() {
        this.getLiveBootstrap().catch((error) => {
            console.error('[usage-runtime] background live bootstrap failed', error)
        })
    }

    private async buildLiveBootstrap() {
        if (!this.state.indexedFiles) {
            throw new Error('Cannot build live bootstrap: no indexed files available. Run refresh first.')
        }

        const indexedFiles = this.state.indexedFiles

        resetRemotePricingCache()
        const repricedFiles = await hydrateIndexedUsageSourceFiles(indexedFiles)
        const bootstrapByPlatform = buildPlatformSessionsByPlatform(repricedFiles, {
            updatedPlatforms: PROJECT_USAGE_PLATFORMS,
        })
        const eventsByPlatform = buildEventsByPlatformFromFiles(repricedFiles)

        const bootstrap = buildBootstrapFromPlatformSessions(this.config.version, bootstrapByPlatform, eventsByPlatform)

        this.liveBootstrap = bootstrap
        this.liveBootstrapFetchedAt = Date.now()

        return bootstrap
    }

    subscribeToUpdates(listener: (update: UsageRuntimeUpdate) => void) {
        this.updateListeners.add(listener)

        return () => {
            this.updateListeners.delete(listener)
        }
    }

    private async ensureHydratedCurrentProcessState() {
        await this.initialize()

        if (this.state.bootstrap && this.state.hasIndexedCurrentProcess) {
            return
        }

        await this.refreshNow({
            hydrateCachedPricing: !this.state.bootstrap,
        })
    }

    private async refreshNow(options: {
        discoveredFiles?: DiscoveredUsageFile[]
        forceLog?: boolean
        hydrateCachedPricing?: boolean
        reparseAllFiles?: boolean
        updatedPlatforms?: readonly ProjectUsagePlatform[]
    } = {}) {
        if (!this.refreshPromise) {
            this.refreshPromise = this.refresh(options)
                .finally(() => {
                    this.refreshPromise = null

                    if (this.refreshRequestedWhileBusy) {
                        this.refreshRequestedWhileBusy = false
                        void this.refreshInBackground()
                    }
                })
        }

        return this.refreshPromise
    }

    private refreshInBackground() {
        return this.refreshNow().catch((error) => {
            console.error('[usage-runtime] background refresh failed', error)
        })
    }

    private async refresh(options: {
        discoveredFiles?: DiscoveredUsageFile[]
        forceLog?: boolean
        hydrateCachedPricing?: boolean
        reparseAllFiles?: boolean
        updatedPlatforms?: readonly ProjectUsagePlatform[]
    } = {}) {
        this.state.refreshStartedAt = Date.now()
        const reporter = new UsageCleaningConsoleReporter({
            verboseProgress: Boolean(options.forceLog),
        })

        try {
            const discoveredFiles = options.discoveredFiles ?? await this.consumeWatcherDiscoveredFiles()
            // When indexedFiles is null (first run after DB hydration), force all platforms
            // to be parsed so that indexedFiles includes every platform, not just changed ones.
            const updatedPlatforms = (!this.state.indexedFiles && options.updatedPlatforms)
                ? PROJECT_USAGE_PLATFORMS
                : options.updatedPlatforms
            const indexed = await buildIncrementalUsageIndex(this.config, this.repository, reporter, {
                cachedFiles: this.state.indexedFiles ?? undefined,
                cachedPlatformSessions: options.hydrateCachedPricing
                    ? undefined
                    : (this.state.bootstrap ? Object.fromEntries(PROJECT_USAGE_PLATFORMS.map(platform => [platform, this.state.bootstrap![platform].sessionUsage as ProjectSessionUsageItem[]])) as ProjectUsagePlatformRecord<ProjectSessionUsageItem[]> : undefined),
                discoveredFiles,
                forceLog: options.forceLog,
                hydrateCachedPricing: options.hydrateCachedPricing,
                reparseAllFiles: options.reparseAllFiles,
                updatedPlatforms,
            })
            const { bootstrapByPlatform, eventsByPlatform } = indexed
            const bootstrap = buildBootstrapFromPlatformSessions(this.config.version, bootstrapByPlatform, eventsByPlatform)
            const projectCatalog = buildProjectCatalogFromPlatformSessions(bootstrapByPlatform)
            const updatedAt = useDateFormat(Date.now(), 'iso') ?? new Date().toISOString()
            const shouldReport = options.forceLog || indexed.hasChanges
            const cacheWriteStats = {
                agentCount: PROJECT_USAGE_PLATFORMS.length,
                projectCount: projectCatalog.length,
                projectDetailsRemovedCount: 0,
                projectDetailsWriteCount: 0,
                sessionCount: PROJECT_USAGE_PLATFORMS.reduce((sum, platform) => sum + bootstrapByPlatform[platform].length, 0),
                sourceFileCount: indexed.indexedFiles.length,
                updatedSessions: indexed.updatedSessions,
            }

            if (shouldReport) {
                reporter.finishCacheWrite(cacheWriteStats)
            }

            this.state.bootstrap = bootstrap
            this.state.discoveredFiles = indexed.indexedFiles.map(({ cacheSignature, mtimeMs, path, platform, size }) => ({ cacheSignature, mtimeMs, path, platform, size }))
            this.state.eventsByPlatform = eventsByPlatform
            this.state.indexedFiles = indexed.indexedFiles
            this.state.indexedFileMetas = indexed.indexedFiles.map(({ cacheSignature, mtimeMs, path, platform, projectNames, size, updatedAt }) => ({ cacheSignature, mtimeMs, path, platform, projectNames, size, updatedAt }))
            this.state.projectCatalog = projectCatalog
            this.state.projectDetails = null
            this.state.hasLoadedAllProjectDetails = false
            this.state.hasIndexedCurrentProcess = true
            this.state.hydratedAt = Date.now()
            this.liveBootstrap = null
            this.liveBootstrapFetchedAt = 0

            if (indexed.hasChanges) {
                this.emitUpdate({
                    affectedProjects: indexed.affectedProjects,
                    updatedAt,
                    updatedPlatforms: indexed.updatedPlatforms,
                    updatedSessions: indexed.updatedSessions,
                })
            }

            if (shouldReport) {
                reporter.complete({
                    agentCount: cacheWriteStats.agentCount,
                    durationMs: Date.now() - this.state.refreshStartedAt,
                    phaseDurations: {
                        aggregateMs: indexed.timing.aggregateMs,
                        cacheWriteMs: 0,
                        discoveryMs: indexed.timing.discoveryMs,
                        parseMs: indexed.timing.parseMs,
                    },
                    projectCount: cacheWriteStats.projectCount,
                    projectDetailsRemovedCount: cacheWriteStats.projectDetailsRemovedCount,
                    projectDetailsWriteCount: cacheWriteStats.projectDetailsWriteCount,
                    sessionCount: cacheWriteStats.sessionCount,
                    sourceFileCount: cacheWriteStats.sourceFileCount,
                    updatedSessions: cacheWriteStats.updatedSessions,
                })
            }
        }
        catch (error) {
            reporter.fail(error)
            throw error
        }
    }

    dispose() {
        if (this.watcherDebounceTimer) {
            clearTimeout(this.watcherDebounceTimer)
            this.watcherDebounceTimer = null
        }

        if (this.watcher) {
            const watcher = this.watcher
            this.watcher = null
            void watcher.close()
        }

        this.repository.close()
    }

    private startWatcher() {
        if (this.watcher) {
            return
        }

        const watcher = chokidar.watch(PROJECT_USAGE_PLATFORMS.flatMap(platform => usagePlatformAdapters[platform].watchPatterns(this.config)), {
            awaitWriteFinish: {
                pollInterval: 100,
                stabilityThreshold: 250,
            },
            ignoreInitial: true,
            persistent: true,
        })

        watcher
            .on('add', path => this.scheduleRefreshByWatcher('add', path))
            .on('change', path => this.scheduleRefreshByWatcher('change', path))
            .on('unlink', path => this.scheduleRefreshByWatcher('unlink', path))
            .on('error', (error) => {
                console.error('[usage-runtime] watcher error', error)
            })

        this.watcher = watcher
    }

    private scheduleRefreshByWatcher(event: 'add' | 'change' | 'unlink', path: string) {
        this.pendingWatcherPaths.set(path, event)

        if (this.watcherDebounceTimer) {
            clearTimeout(this.watcherDebounceTimer)
        }

        this.watcherDebounceTimer = setTimeout(() => {
            this.watcherDebounceTimer = null

            if (this.refreshPromise) {
                this.refreshRequestedWhileBusy = true
                return
            }

            void this.refreshInBackground()
        }, WATCHER_DEBOUNCE_MS)
    }

    private async consumeWatcherDiscoveredFiles() {
        if (this.pendingWatcherPaths.size === 0) {
            return undefined
        }

        const discoveredFiles = await this.tryApplyWatcherPathsToDiscoveredFiles()
        this.pendingWatcherPaths.clear()

        return discoveredFiles
    }

    private async tryApplyWatcherPathsToDiscoveredFiles() {
        const cachedDiscoveredFiles = this.state.discoveredFiles

        if (!cachedDiscoveredFiles || cachedDiscoveredFiles.length === 0) {
            return undefined
        }

        const nextFilesByPath = new Map(cachedDiscoveredFiles.map(file => [file.path, file]))

        for (const [filePath, event] of this.pendingWatcherPaths) {
            const cachedFile = nextFilesByPath.get(filePath)

            if (event === 'unlink') {
                if (!cachedFile) {
                    return undefined
                }

                nextFilesByPath.delete(filePath)
                continue
            }

            if (!cachedFile) {
                return undefined
            }

            try {
                const stat = await fsPromises.stat(filePath)

                nextFilesByPath.set(filePath, {
                    ...cachedFile,
                    mtimeMs: stat.mtimeMs,
                    size: stat.size,
                })
            }
            catch {
                return undefined
            }
        }

        return Array.from(nextFilesByPath.values()).sort((a, b) => a.path.localeCompare(b.path))
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

function buildBootstrapFromPlatformSessions(
    version: string,
    platformSessions: ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>,
    eventsByPlatform?: Partial<ProjectUsagePlatformRecord<UsageAggregateEvent[]>>,
) {
    return {
        ...Object.fromEntries(
            PROJECT_USAGE_PLATFORMS.map(platform => [
                platform,
                buildProjectLoadUsageResult(platformSessions[platform], platform, eventsByPlatform?.[platform]),
            ]),
        ),
        version,
    } as TokensConsumptionResult
}

function buildProjectCatalogFromPlatformSessions(
    platformSessions: ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>,
) {
    const projects = new Map<string, {
        platforms: Set<ProjectUsagePlatform>
        totalTokens: number
    }>()

    for (const platform of PROJECT_USAGE_PLATFORMS) {
        for (const session of platformSessions[platform]) {
            const project = projects.get(session.project) ?? {
                platforms: new Set<ProjectUsagePlatform>(),
                totalTokens: 0,
            }

            project.platforms.add(platform)
            project.totalTokens += session.tokenTotal
            projects.set(session.project, project)
        }
    }

    return Array.from(projects.entries())
        .map(([label, project]) => ({
            label,
            platforms: Array.from(project.platforms).sort((a, b) => a.localeCompare(b)) as ProjectUsagePlatform[],
            totalTokens: project.totalTokens,
        }))
        .sort((a, b) => a.label.localeCompare(b.label))
}
