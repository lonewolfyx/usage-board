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
import {
    buildPlatformLoadUsageResult,
    buildProjectUsageCatalogItemsFromDetails,
    buildProjectUsageDataModuleFromDetail,
    buildProjectUsageDetailFromPlatformSessions,
} from '#shared/platform/project'
import chokidar from 'chokidar'
import { UsageCacheRepository } from '../repositories/sqlite/usage-cache.repository'
import { buildIncrementalUsageIndex } from './usage-indexer'

const RUNTIME_STALE_AFTER_MS = 1000 * 60
const WATCHER_DEBOUNCE_MS = 350

type ProjectDataRequest = Extract<ProjectWebSocketRequest, { type: 'project_data' }>
type PlatformSessionIndex = Record<'claudeCode' | 'codex' | 'gemini', ProjectSessionUsageItem[]>

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

    async getProjectDataModules(
        request: Pick<ProjectDataRequest, 'module' | 'modules' | 'platform' | 'project' | 'sessionId'>,
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
            sessionId: request.sessionId,
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
        const claudeCode = buildPlatformLoadUsageResult(bootstrapByPlatform.claudeCode, 'claudeCode')
        const codex = buildPlatformLoadUsageResult(bootstrapByPlatform.codex, 'codex')
        const gemini = buildPlatformLoadUsageResult(bootstrapByPlatform.gemini, 'gemini')
        const bootstrap: TokensConsumptionResult = {
            claudeCode,
            codex,
            gemini,
            version: this.config.version,
        }
        const projectDetails = this.state.projectDetails.size > 0
            ? patchProjectDetails(this.state.projectDetails, indexed.removedProjects, indexed.affectedProjects, bootstrapByPlatform)
            : buildAllProjectDetails(bootstrapByPlatform)

        const projectCatalog = buildProjectUsageCatalogItemsFromDetails(projectDetails.entries(), this.config)

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
    return [
        ...config.claudeCodePaths.map(path => join(path, 'projects', '**', '*.jsonl')),
        join(config.codexPath, 'sessions', '**', '*.jsonl'),
        join(config.geminiPath, 'tmp', '*', 'chats', 'session-*.json'),
        join(config.geminiPath, 'tmp', '*', 'chats', 'sessions-*.json'),
    ]
}

function patchProjectDetails(
    currentDetails: Map<string, ProjectUsageDetail>,
    removedProjects: string[],
    affectedProjects: string[],
    platformSessions: PlatformSessionIndex,
) {
    const details = new Map(currentDetails)

    for (const projectName of removedProjects) {
        details.delete(projectName)
    }

    for (const projectName of affectedProjects) {
        const detail = buildProjectUsageDetailFromPlatformSessions(projectName, {
            claudeCode: platformSessions.claudeCode.filter(session => session.project === projectName),
            codex: platformSessions.codex.filter(session => session.project === projectName),
            gemini: platformSessions.gemini.filter(session => session.project === projectName),
        })

        if (detail.sessionCound === 0) {
            details.delete(projectName)
            continue
        }

        details.set(projectName, detail)
    }

    return details
}

function buildAllProjectDetails(
    platformSessions: PlatformSessionIndex,
) {
    const projectNames = new Set([
        ...platformSessions.claudeCode.map(session => session.project),
        ...platformSessions.codex.map(session => session.project),
        ...platformSessions.gemini.map(session => session.project),
    ])
    const details = new Map<string, ProjectUsageDetail>()

    for (const projectName of projectNames) {
        const detail = buildProjectUsageDetailFromPlatformSessions(projectName, {
            claudeCode: platformSessions.claudeCode.filter(session => session.project === projectName),
            codex: platformSessions.codex.filter(session => session.project === projectName),
            gemini: platformSessions.gemini.filter(session => session.project === projectName),
        })

        if (detail.sessionCound > 0) {
            details.set(projectName, detail)
        }
    }

    return details
}
