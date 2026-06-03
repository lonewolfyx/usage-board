import type { DiscoveredUsageFile } from '#server/services/usage-indexer/platform-adapter'
import type { IndexedUsageSourceFile, UpdatedUsageSession } from '#server/types/usage-indexer'
import type { ProjectUsagePlatform, ProjectUsagePlatformRecord } from '#shared/types/ai'
import type { HomeDashboardModules } from '#shared/types/analysis'
import type { IConfig } from '#shared/types/config'
import type { ProjectSessionUsageItem, ProjectUsageDetail, TokensConsumptionResult } from '#shared/types/usage-dashboard'
import type {
    ProjectUsageCatalogItem,
    ProjectUsageDataModuleResponse,
    ProjectUsageDataModulesResponse,
    ProjectWebSocketRequest,
} from '#shared/types/ws'
import type { FSWatcher } from 'chokidar'
import { accessSync, constants, statSync } from 'node:fs'
import { join } from 'node:path'
import { UsageCacheRepository } from '#server/repositories/sqlite/usage-cache.repository'
import { UsageCleaningConsoleReporter } from '#server/services/usage-cleaning-reporter'
import {
    buildIncrementalUsageIndex,
    getUsageCacheUpdateState,
} from '#server/services/usage-indexer'
import { usagePlatformAdapters } from '#server/services/usage-indexer/adapters'
import { createEmptyLoadUsageResult } from '#shared/platform/defaults'
import {
    buildProjectLoadUsageResult,
    buildProjectUsageDataModuleFromDetail,
    buildProjectUsageDetailFromPlatformSessions,
} from '#shared/platform/project'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'
import { buildHomeDashboardModules } from '#shared/utils/analysis-dashboard'
import chokidar from 'chokidar'

const WATCHER_DEBOUNCE_MS = 350

export interface UsageRuntimeUpdate {
    affectedProjects: string[]
    updatedAt: string
    updatedPlatforms: readonly ProjectUsagePlatform[]
    updatedSessions: UpdatedUsageSession[]
}

interface UsageRuntimeState {
    bootstrap: TokensConsumptionResult | null
    discoveredFiles: DiscoveredUsageFile[] | null
    hasIndexedCurrentProcess: boolean
    hasLoadedAllProjectDetails: boolean
    hydratedAt: number
    indexedFiles: IndexedUsageSourceFile[] | null
    projectCatalog: ProjectUsageCatalogItem[]
    projectDetails: Map<string, ProjectUsageDetail> | null
    refreshStartedAt: number
}

class UsageDataRuntime {
    private readonly repository: UsageCacheRepository
    private readonly state: UsageRuntimeState = {
        bootstrap: null,
        discoveredFiles: null,
        hasIndexedCurrentProcess: false,
        hasLoadedAllProjectDetails: false,
        hydratedAt: 0,
        indexedFiles: null,
        projectCatalog: [],
        projectDetails: null,
        refreshStartedAt: 0,
    }

    private initializePromise: Promise<void> | null = null
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
            this.initializePromise = this.hydrateFromRepository()
                .finally(() => {
                    this.startWatcher()
                })
        }

        return this.initializePromise
    }

    async getBootstrap() {
        await this.ensureHydratedCurrentProcessState()

        return this.state.bootstrap!
    }

    async ensureFreshBootstrapForStartup(options: {
        verboseWhenChanged?: boolean
    } = {}) {
        await this.initialize()
        const updateState = await getUsageCacheUpdateState(this.config, this.repository, this.state.hydratedAt)

        const updatedPlatforms = updateState.updatedPlatforms.length > 0
            ? updateState.updatedPlatforms
            : PROJECT_USAGE_PLATFORMS

        await this.refreshNow({
            discoveredFiles: updateState.discoveredFiles,
            forceLog: !this.state.bootstrap || (options.verboseWhenChanged !== false && updateState.hasChanges),
            hydrateCachedPricing: true,
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

    async getHomeDashboardModules(): Promise<HomeDashboardModules> {
        return buildHomeDashboardModules(await this.getBootstrap())
    }

    async getLiveState() {
        await this.ensureHydratedCurrentProcessState()

        return {
            updatedAt: this.state.hydratedAt > 0
                ? new Date(this.state.hydratedAt).toISOString()
                : '',
        }
    }

    async getProjectDataModules(
        request: Pick<Extract<ProjectWebSocketRequest, { type: 'project_data' }>, 'module' | 'modules' | 'page' | 'pageSize' | 'platform' | 'project'>,
    ): Promise<ProjectUsageDataModuleResponse | ProjectUsageDataModulesResponse | null> {
        await this.ensureHydratedCurrentProcessState()
        const projectLabel = (request.project || '').trim()

        if (!projectLabel) {
            throw new Error('Missing project name for project data request.')
        }

        let hydratedDetail = this.state.projectDetails?.get(projectLabel)
            ?? getProjectDetailFromBootstrap(this.state.bootstrap, projectLabel)

        if (!hydratedDetail) {
            await this.refreshNow()
            hydratedDetail = this.state.projectDetails?.get(projectLabel)
                ?? getProjectDetailFromBootstrap(this.state.bootstrap, projectLabel)
        }

        if (hydratedDetail) {
            const projectDetails = this.state.projectDetails ?? new Map<string, ProjectUsageDetail>()

            projectDetails.set(projectLabel, hydratedDetail)
            this.state.projectDetails = projectDetails
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
            hydrateCachedPricing: true,
        })
    }

    private async hydrateFromRepository() {
        const indexedFiles = this.repository.loadIndexedSourceFiles()
        const bootstrap = this.repository.loadBootstrap()
        const projectCatalog = this.repository.loadProjectCatalog()

        this.state.bootstrap = bootstrap?.payload ?? null
        this.state.discoveredFiles = toDiscoveredUsageFiles(indexedFiles)
        this.state.indexedFiles = indexedFiles
        this.state.hydratedAt = [
            indexedFiles.reduce((latest, file) => Math.max(latest, Date.parse(file.updatedAt)), 0),
            bootstrap ? Date.parse(bootstrap.updatedAt) : 0,
            projectCatalog ? Date.parse(projectCatalog.updatedAt) : 0,
        ].reduce((latest, value) => Math.max(latest, value), 0)
        this.state.projectCatalog = projectCatalog?.payload ?? []
        this.state.projectDetails = null
        this.state.hasLoadedAllProjectDetails = false
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
            const discoveredFiles = options.discoveredFiles ?? this.consumeWatcherDiscoveredFiles()
            const indexed = await buildIncrementalUsageIndex(this.config, this.repository, reporter, {
                cachedFiles: this.state.indexedFiles ?? undefined,
                cachedPlatformSessions: options.hydrateCachedPricing
                    ? undefined
                    : (this.state.bootstrap ? getCachedPlatformSessions(this.state.bootstrap) : undefined),
                discoveredFiles,
                forceLog: options.forceLog,
                hydrateCachedPricing: options.hydrateCachedPricing,
                reparseAllFiles: options.reparseAllFiles,
                updatedPlatforms: options.updatedPlatforms,
            })
            const { bootstrapByPlatform } = indexed
            const bootstrap = buildBootstrapFromPlatformSessions(this.config.version, bootstrapByPlatform)
            const projectCatalog = buildProjectCatalogFromPlatformSessions(bootstrapByPlatform)
            const updatedAt = new Date().toISOString()
            const shouldReport = options.forceLog || indexed.hasChanges
            const cacheWriteStats = {
                agentCount: PROJECT_USAGE_PLATFORMS.length,
                projectCount: projectCatalog.length,
                projectDetailsRemovedCount: 0,
                projectDetailsWriteCount: 0,
                sessionCount: getTotalSessionCount(bootstrapByPlatform),
                sourceFileCount: indexed.indexedFiles.length,
                updatedSessions: indexed.updatedSessions,
            }

            this.repository.saveBootstrap(bootstrap)
            this.repository.saveProjectCatalog(projectCatalog)

            if (shouldReport) {
                reporter.finishCacheWrite(cacheWriteStats)
            }

            this.state.bootstrap = bootstrap
            this.state.discoveredFiles = toDiscoveredUsageFiles(indexed.indexedFiles)
            this.state.indexedFiles = indexed.indexedFiles
            this.state.projectCatalog = projectCatalog
            this.state.projectDetails = null
            this.state.hasLoadedAllProjectDetails = false
            this.state.hasIndexedCurrentProcess = true
            this.state.hydratedAt = Date.now()

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

        const watcher = chokidar.watch(getUsageWatchPatterns(this.config), {
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

    private consumeWatcherDiscoveredFiles() {
        if (this.pendingWatcherPaths.size === 0) {
            return undefined
        }

        const discoveredFiles = this.tryApplyWatcherPathsToDiscoveredFiles()
        this.pendingWatcherPaths.clear()

        return discoveredFiles
    }

    private tryApplyWatcherPathsToDiscoveredFiles() {
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
                const stat = statSync(filePath)

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
    if (isWritableDirectory(config.home)) {
        return join(config.home, '.usage-board', 'cache.sqlite')
    }

    return join(process.cwd(), '.data', 'usage-board', 'cache.sqlite')
}

function isWritableDirectory(directoryPath: string) {
    try {
        accessSync(directoryPath, constants.W_OK)
        return true
    }
    catch {
        return false
    }
}

function getUsageWatchPatterns(config: IConfig) {
    return PROJECT_USAGE_PLATFORMS.flatMap(platform => usagePlatformAdapters[platform].watchPatterns(config))
}

function buildBootstrapFromPlatformSessions(
    version: string,
    platformSessions: ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>,
) {
    return {
        ...Object.fromEntries(
            PROJECT_USAGE_PLATFORMS.map(platform => [
                platform,
                buildProjectLoadUsageResult(platformSessions[platform], platform),
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

function getProjectPlatformSessions(
    platformSessions: ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>,
    projectName: string,
): ProjectUsagePlatformRecord<ProjectSessionUsageItem[]> {
    return Object.fromEntries(
        PROJECT_USAGE_PLATFORMS.map(platform => [
            platform,
            platformSessions[platform].filter(session => session.project === projectName),
        ]),
    ) as ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>
}

function getTotalSessionCount(platformSessions: ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>) {
    return PROJECT_USAGE_PLATFORMS.reduce((sum, platform) => sum + platformSessions[platform].length, 0)
}

function getProjectDetailFromBootstrap(
    bootstrap: TokensConsumptionResult | null,
    projectName: string,
) {
    if (!bootstrap) {
        return null
    }

    const detail = buildProjectUsageDetailFromPlatformSessions(projectName, getProjectPlatformSessions(getCachedPlatformSessions(bootstrap), projectName))

    return detail.sessionCound > 0 ? detail : null
}

function getCachedPlatformSessions(bootstrap: TokensConsumptionResult) {
    return Object.fromEntries(
        PROJECT_USAGE_PLATFORMS.map(platform => [platform, bootstrap[platform].sessionUsage as ProjectSessionUsageItem[]]),
    ) as ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>
}

function toDiscoveredUsageFiles(indexedFiles: IndexedUsageSourceFile[]): DiscoveredUsageFile[] {
    return indexedFiles.map(file => ({
        cacheSignature: file.cacheSignature,
        mtimeMs: file.mtimeMs,
        path: file.path,
        platform: file.platform,
        size: file.size,
    }))
}
