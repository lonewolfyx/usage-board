import type { ProjectUsagePlatform, ProjectUsagePlatformRecord } from '#shared/types/ai'
import type { IConfig } from '#shared/types/config'
import type { ProjectSessionUsageItem, ProjectUsageDetail, TokensConsumptionResult } from '#shared/types/usage-dashboard'
import type {
    ProjectUsageCatalogItem,
    ProjectUsageDataModuleResponse,
    ProjectUsageDataModulesResponse,
    ProjectWebSocketRequest,
} from '#shared/types/ws'
import type { FSWatcher } from 'chokidar'
import { accessSync, constants } from 'node:fs'
import { join } from 'node:path'
import { UsageCacheRepository } from '#server/repositories/sqlite/usage-cache.repository'
import { buildIncrementalUsageIndex } from '#server/services/usage-indexer'
import { usagePlatformAdapters } from '#server/services/usage-indexer/adapters'
import { createEmptyLoadUsageResult } from '#shared/platform/defaults'
import {
    buildProjectLoadUsageResult,
    buildProjectUsageCatalogItemsFromDetails,
    buildProjectUsageDataModuleFromDetail,
    buildProjectUsageDetailFromPlatformSessions,
} from '#shared/platform/project'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'
import chokidar from 'chokidar'

const RUNTIME_STALE_AFTER_MS = 1000 * 60
const WATCHER_DEBOUNCE_MS = 350

interface UsageRuntimeState {
    bootstrap: TokensConsumptionResult | null
    hydratedAt: number
    projectCatalog: ProjectUsageCatalogItem[]
    projectDetails: Map<string, ProjectUsageDetail>
    refreshStartedAt: number
}

class UsageDataRuntime {
    private readonly repository: UsageCacheRepository
    private readonly state: UsageRuntimeState = {
        bootstrap: null,
        hydratedAt: 0,
        projectCatalog: [],
        projectDetails: new Map<string, ProjectUsageDetail>(),
        refreshStartedAt: 0,
    }

    private initializePromise: Promise<void> | null = null
    private refreshPromise: Promise<void> | null = null
    private refreshRequestedWhileBusy = false
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
                    void this.refreshInBackground()
                })
        }

        return this.initializePromise
    }

    async getBootstrap() {
        await this.initialize()

        if (!this.state.bootstrap) {
            await this.refreshNow()
        }
        else {
            this.scheduleRefreshIfStale()
        }

        return this.state.bootstrap!
    }

    async getProjectCatalog() {
        await this.initialize()

        if (this.state.projectCatalog.length === 0 && this.state.projectDetails.size === 0) {
            await this.refreshNow()
        }
        else {
            this.scheduleRefreshIfStale()
        }

        return this.state.projectCatalog
    }

    async getAgentDashboard(platform: ProjectUsagePlatform) {
        const bootstrap = await this.getBootstrap()

        return bootstrap[platform] ?? createEmptyLoadUsageResult()
    }

    async getProjectDataModules(
        request: Pick<Extract<ProjectWebSocketRequest, { type: 'project_data' }>, 'module' | 'modules' | 'platform' | 'project'>,
    ): Promise<ProjectUsageDataModuleResponse | ProjectUsageDataModulesResponse | null> {
        await this.initialize()
        const projectLabel = (request.project || '').trim()

        if (!projectLabel) {
            throw new Error('Missing project name for project data request.')
        }

        const detail = this.state.projectDetails.get(projectLabel)

        if (!detail) {
            await this.refreshNow()
        }
        else {
            this.scheduleRefreshIfStale()
        }

        const hydratedDetail = this.state.projectDetails.get(projectLabel)

        if (!hydratedDetail) {
            return null
        }

        return buildProjectUsageDataModuleFromDetail(hydratedDetail, {
            module: request.module,
            modules: request.modules,
            platform: request.platform,
        })
    }

    private async hydrateFromRepository() {
        const bootstrap = this.repository.loadBootstrap()
        const projectCatalog = this.repository.loadProjectCatalog()
        const projectDetails = this.repository.loadProjectDetails()

        this.state.bootstrap = bootstrap?.payload ?? null
        this.state.projectCatalog = projectCatalog?.payload ?? []
        this.state.projectDetails = projectDetails
        this.state.hydratedAt = Math.max(
            bootstrap ? Date.parse(bootstrap.updatedAt) : 0,
            projectCatalog ? Date.parse(projectCatalog.updatedAt) : 0,
        )
    }

    private async refreshNow() {
        if (!this.refreshPromise) {
            this.refreshPromise = this.refresh()
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

    private scheduleRefreshIfStale() {
        if (Date.now() - this.state.hydratedAt < RUNTIME_STALE_AFTER_MS) {
            return
        }

        if (this.refreshPromise || Date.now() - this.state.refreshStartedAt < 1000) {
            return
        }

        void this.refreshInBackground()
    }

    private async refresh() {
        this.state.refreshStartedAt = Date.now()

        const indexed = await buildIncrementalUsageIndex(this.config, this.repository)
        const { bootstrapByPlatform } = indexed
        const bootstrap: TokensConsumptionResult = {
            ...Object.fromEntries(
                PROJECT_USAGE_PLATFORMS.map(platform => [
                    platform,
                    buildProjectLoadUsageResult(bootstrapByPlatform[platform], platform),
                ]),
            ),
            version: this.config.version,
        } as TokensConsumptionResult
        const projectDetails = this.state.projectDetails.size > 0
            ? patchProjectDetails(this.state.projectDetails, indexed.removedProjects, indexed.affectedProjects, bootstrapByPlatform)
            : buildAllProjectDetails(bootstrapByPlatform)

        const projectCatalog = buildProjectUsageCatalogItemsFromDetails(projectDetails.entries())

        this.repository.saveBootstrap(bootstrap)
        this.repository.saveProjectCatalog(projectCatalog)
        this.repository.replaceProjectDetails(projectDetails)

        this.state.bootstrap = bootstrap
        this.state.projectCatalog = projectCatalog
        this.state.projectDetails = projectDetails
        this.state.hydratedAt = Date.now()
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
            .on('add', () => this.scheduleRefreshByWatcher())
            .on('change', () => this.scheduleRefreshByWatcher())
            .on('unlink', () => this.scheduleRefreshByWatcher())
            .on('error', (error) => {
                console.error('[usage-runtime] watcher error', error)
            })

        this.watcher = watcher
    }

    private scheduleRefreshByWatcher() {
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

function patchProjectDetails(
    currentDetails: Map<string, ProjectUsageDetail>,
    removedProjects: string[],
    affectedProjects: string[],
    platformSessions: ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>,
) {
    const details = new Map(currentDetails)

    for (const projectName of removedProjects) {
        details.delete(projectName)
    }

    for (const projectName of affectedProjects) {
        const detail = buildProjectUsageDetailFromPlatformSessions(projectName, getProjectPlatformSessions(platformSessions, projectName))

        if (detail.sessionCound === 0) {
            details.delete(projectName)
            continue
        }

        details.set(projectName, detail)
    }

    return details
}

function buildAllProjectDetails(
    platformSessions: ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>,
) {
    const projectNames = new Set(PROJECT_USAGE_PLATFORMS.flatMap(platform => platformSessions[platform].map(session => session.project)))
    const details = new Map<string, ProjectUsageDetail>()

    for (const projectName of projectNames) {
        const detail = buildProjectUsageDetailFromPlatformSessions(projectName, getProjectPlatformSessions(platformSessions, projectName))

        if (detail.sessionCound > 0) {
            details.set(projectName, detail)
        }
    }

    return details
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
