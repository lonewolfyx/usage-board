import type { ProjectUsagePlatform } from '#shared/types/ai'
import type {
    ProjectDailyTrendModulePayload,
    ProjectDashboardScope,
    ProjectLineSeries,
    ProjectModelUsageModulePayload,
    ProjectPendingWebSocketRequest,
    ProjectPlatformModulePayload,
    ProjectPlatformView,
    ProjectSelectItem,
    ProjectSessionListModulePayload,
    ProjectTabSummary,
    ProjectTokenUsageModulePayload,
} from '#shared/types/project-dashboard'
import type {
    ProjectUsageCatalogItem,
    ProjectUsageDataModule,
    ProjectUsageDataModulesResponse,
    ProjectWebSocketRequest,
    ProjectWebSocketResponse,
} from '#shared/types/ws'
import type { ShallowRef } from 'vue'
import { PROJECT_USAGE_DATA_MODULES } from '#shared/types/ws'
import {
    buildMonthlyTickIndexes,
    buildProjectDailyModelUsageChart,
    buildProjectOverviewCards,
    buildProjectPlatformOverviewCards,
    buildRecentDateLabels,
    projectDashboardTabs,
    projectPlatformTabs,
    summarizeProjectSessions,
    toProjectDisplayDailyUsageRows,
    toProjectSessionTableRow,
    toProjectSessionTableRows,
} from '#shared/utils/project-dashboard'
import {
    formatCompactNumber,
    formatCurrency,
    mergeDailyTokenUsage,
} from '#shared/utils/usage-dashboard'

const recentProjectDays = 30
const yearlyProjectDays = 365
const projectSelectionDebounceMs = 180
const projectSelectionMaxWaitMs = 600
const websocketRequestTimeoutMs = 45_000

const tabs = projectDashboardTabs
const platformTabs = projectPlatformTabs

const emptyDailyTrendPayload: ProjectDailyTrendModulePayload = {
    dailyRows: [],
    dailyTokenUsage: [],
}

const emptyModelUsagePayload: ProjectModelUsageModulePayload = {
    dailyTokenUsage: [],
    monthlyModelUsage: [],
}

const emptyTokenUsagePayload: ProjectTokenUsageModulePayload = {
    dailyRows: [],
    monthlyRows: [],
    sessionRows: [],
    weeklyRows: [],
}

const emptySessionListPayload: ProjectSessionListModulePayload = {
    sessionRows: [],
    sessionUsage: [],
    sessions: [],
}

const projectModuleDefaults = {
    daily_trend: emptyDailyTrendPayload,
    model_usage: emptyModelUsagePayload,
    session_list: emptySessionListPayload,
    token_usage: emptyTokenUsagePayload,
} satisfies ProjectModulePayloadMap

interface ProjectModulePayloadMap {
    daily_trend: ProjectDailyTrendModulePayload
    model_usage: ProjectModelUsageModulePayload
    session_list: ProjectSessionListModulePayload
    token_usage: ProjectTokenUsageModulePayload
}

type ProjectModuleStateMap = {
    [TModule in keyof ProjectModulePayloadMap]: ShallowRef<ProjectPlatformModulePayload<ProjectModulePayloadMap[TModule]> | null>
}

export function useProjectDashboard() {
    const selectedProjectId = shallowRef('')
    const activeTab = shallowRef<ProjectDashboardScope>('all')
    const catalogLoading = shallowRef(false)
    const projectCatalog = shallowRef<ProjectUsageCatalogItem[]>([])
    const websocketError = shallowRef('')
    const projectModules = Object.fromEntries(
        PROJECT_USAGE_DATA_MODULES.map(module => [module, shallowRef(null)]),
    ) as ProjectModuleStateMap
    const loadingModules = reactive(Object.fromEntries(
        PROJECT_USAGE_DATA_MODULES.map(module => [module, false]),
    ) as Record<ProjectUsageDataModule, boolean>)

    let moduleLoadRunId = 0
    let requestIdCounter = 0
    const pendingWebSocketRequests = new Map<string, ProjectPendingWebSocketRequest>()

    const wsUrl = computed(() => {
        if (!import.meta.client) {
            return ''
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

        return `${protocol}//${window.location.host}/ws`
    })

    const { open, send, status } = useWebSocket(wsUrl, {
        immediate: false,
        autoReconnect: {
            delay: 1000,
            retries: 3,
        },
        onConnected() {
            void loadProjectCatalog()
        },
        onDisconnected() {
            rejectPendingRequests(new Error('WebSocket connection closed.'))
        },
        onError() {
            websocketError.value = 'WebSocket connection error.'
        },
        onMessage(_ws, event) {
            handleWebSocketMessage(event.data)
        },
    })

    const projects = computed<ProjectSelectItem[]>(() => projectCatalog.value.map(project => ({
        id: project.label,
        name: project.label,
        type: project.type,
    })))
    const isProjectModuleLoading = computed(() => PROJECT_USAGE_DATA_MODULES.some(module => loadingModules[module]))
    const isProjectSelectDisabled = computed(() => catalogLoading.value || isProjectModuleLoading.value || projects.value.length === 0)
    const isScopeReady = computed(() => isModuleLoaded('session_list'))
    const visiblePlatformSessions = computed(() => platformTabs
        .flatMap(tab => getPlatformModulePayload('session_list', tab.value).sessions)
        .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)))
    const visiblePlatformDailyUsage = computed(() => mergeDailyTokenUsage(
        platformTabs.flatMap(tab => getPlatformModulePayload('daily_trend', tab.value).dailyTokenUsage),
    ))
    const visiblePlatformModelUsage = computed(() => mergeDailyTokenUsage(
        platformTabs.flatMap(tab => getPlatformModulePayload('model_usage', tab.value).dailyTokenUsage),
    ))
    const tabSummaries = computed<Record<ProjectDashboardScope, ProjectTabSummary>>(() => Object.fromEntries(
        tabs.map((tab) => {
            const summary = summarizeProjectSessions(
                tab.value === 'all'
                    ? visiblePlatformSessions.value
                    : getPlatformModulePayload('session_list', tab.value).sessions,
            )

            return [tab.value, {
                cost: formatCurrency(summary.costUSD),
                label: tab.label,
                sessions: String(summary.sessions),
                tokens: formatCompactNumber(summary.totalTokens),
            }]
        }),
    ) as Record<ProjectDashboardScope, ProjectTabSummary>)
    const activeTabSummary = computed(() => tabSummaries.value[activeTab.value])
    const activeScopeItems = computed(() => [
        {
            label: 'Tokens',
            value: activeTabSummary.value.tokens,
        },
        {
            label: 'Spend',
            value: activeTabSummary.value.cost,
        },
        {
            label: 'Sessions',
            value: activeTabSummary.value.sessions,
        },
    ])
    const recentDayLabels = computed(() => buildRecentDateLabels(recentProjectDays))
    const yearlyDayLabels = computed(() => buildRecentDateLabels(yearlyProjectDays))
    const yearlyTickIndexes = computed(() => buildMonthlyTickIndexes(yearlyDayLabels.value))
    const allOverviewCards = computed(() => buildProjectOverviewCards(visiblePlatformSessions.value))
    const allDailyUsageRows = computed(() => toProjectDisplayDailyUsageRows(
        visiblePlatformDailyUsage.value,
        visiblePlatformSessions.value,
    ))
    const allSessionRows = computed(() => platformTabs
        .flatMap(tab => getPlatformModulePayload('session_list', tab.value).sessions.map(session => ({
            platform: tab.value,
            session,
        })))
        .sort((a, b) => Date.parse(b.session.startedAt) - Date.parse(a.session.startedAt))
        .map(({ platform, session }) => toProjectSessionTableRow(session, platform)))
    const dailyTrendLabels = computed(() => recentDayLabels.value)
    const dailyTooltipLabels = computed(() => dailyTrendLabels.value)
    const dailySeries = computed<ProjectLineSeries[]>(() => platformTabs.map(tab => ({
        color: tab.color,
        label: tab.label,
        points: getDailySeriesPoints(tab.value, dailyTrendLabels.value),
    })))
    const allModelChart = computed(() => buildProjectDailyModelUsageChart(
        visiblePlatformModelUsage.value,
        recentDayLabels.value,
    ))
    const platformViews = computed<Record<ProjectUsagePlatform, ProjectPlatformView>>(() => Object.fromEntries(
        platformTabs.map((tab) => {
            const trendLabels = yearlyDayLabels.value
            const dailyTrendPayload = getPlatformModulePayload('daily_trend', tab.value)
            const modelUsagePayload = getPlatformModulePayload('model_usage', tab.value)
            const tokenUsagePayload = getPlatformModulePayload('token_usage', tab.value)
            const sessionListPayload = getPlatformModulePayload('session_list', tab.value)
            const modelChart = buildProjectDailyModelUsageChart(modelUsagePayload.dailyTokenUsage, trendLabels)

            return [tab.value, {
                modelLabels: modelChart.labels,
                modelSeries: modelChart.series,
                modelTickIndexes: yearlyTickIndexes.value,
                dayRows: tokenUsagePayload.dailyRows,
                monthRows: tokenUsagePayload.monthlyRows,
                overviewCards: buildProjectPlatformOverviewCards(
                    sessionListPayload.sessions,
                    dailyTrendPayload.dailyTokenUsage,
                ),
                sessionRows: tokenUsagePayload.sessionRows,
                sessionTableRows: toProjectSessionTableRows(sessionListPayload.sessions, tab.value),
                trendLabels,
                trendSeries: [{
                    color: tab.color,
                    label: tab.label,
                    points: getDailySeriesPoints(tab.value, trendLabels),
                }],
                trendTickIndexes: yearlyTickIndexes.value,
                trendTooltipLabels: trendLabels,
                weekRows: tokenUsagePayload.weeklyRows,
            }]
        }),
    ) as Record<ProjectUsagePlatform, ProjectPlatformView>)

    onMounted(() => {
        open()
    })

    onScopeDispose(() => {
        rejectPendingRequests(new Error('Project dashboard disposed.'))
    })

    watch(selectedProjectId, (projectId) => {
        invalidateProjectModuleLoad()

        if (!projectId) {
            resetProjectModules()
        }
    })

    watchDebounced(selectedProjectId, (projectId) => {
        if (!projectId) {
            return
        }

        void loadProjectModules(projectId)
    }, {
        debounce: projectSelectionDebounceMs,
        maxWait: projectSelectionMaxWaitMs,
    })

    function invalidateProjectModuleLoad() {
        moduleLoadRunId += 1
        resetProjectModules()
        websocketError.value = ''
    }

    async function loadProjectCatalog() {
        catalogLoading.value = true
        websocketError.value = ''

        try {
            const catalog = await sendWebSocketRequest<ProjectUsageCatalogItem[]>({ type: 'project' })
            const existingProject = catalog.find(project => project.label === selectedProjectId.value)

            projectCatalog.value = catalog
            selectedProjectId.value = existingProject?.label ?? catalog[0]?.label ?? ''
        }
        catch (error) {
            websocketError.value = error instanceof Error ? error.message : 'Failed to load project catalog.'
        }
        finally {
            catalogLoading.value = false
        }
    }

    async function loadProjectModules(projectId: string) {
        const project = projects.value.find(project => project.id === projectId)

        if (!project) {
            resetProjectModules()
            return
        }

        const runId = moduleLoadRunId + 1
        moduleLoadRunId = runId
        resetProjectModules()
        for (const module of PROJECT_USAGE_DATA_MODULES) {
            loadingModules[module] = true
        }

        try {
            const response = await sendWebSocketRequest<ProjectUsageDataModulesResponse>({
                modules: [...PROJECT_USAGE_DATA_MODULES],
                project: project.id,
                type: 'project_data',
            })

            if (runId !== moduleLoadRunId || response.label !== project.id) {
                return
            }

            setProjectModulesData(response)
        }
        catch (error) {
            if (runId !== moduleLoadRunId) {
                return
            }

            websocketError.value = error instanceof Error ? error.message : 'Failed to load project module.'
        }
        finally {
            if (runId === moduleLoadRunId) {
                for (const module of PROJECT_USAGE_DATA_MODULES) {
                    loadingModules[module] = false
                }
            }
        }
    }

    function sendWebSocketRequest<T>(payload: ProjectWebSocketRequest): Promise<T> {
        if (status.value !== 'OPEN') {
            return Promise.reject(new Error('WebSocket is not connected.'))
        }

        const requestId = createRequestId()

        return new Promise<T>((resolve, reject) => {
            const timeout = window.setTimeout(() => {
                pendingWebSocketRequests.delete(requestId)
                reject(new Error('WebSocket request timed out.'))
            }, websocketRequestTimeoutMs)

            pendingWebSocketRequests.set(requestId, {
                reject: (error) => {
                    window.clearTimeout(timeout)
                    reject(error)
                },
                requestId,
                resolve: (value) => {
                    window.clearTimeout(timeout)
                    resolve(value as T)
                },
            })

            const sent = send(JSON.stringify({
                ...payload,
                requestId,
            }))

            if (!sent) {
                window.clearTimeout(timeout)
                pendingWebSocketRequests.delete(requestId)
                reject(new Error('Failed to send WebSocket request.'))
            }
        })
    }

    function handleWebSocketMessage(rawData: unknown) {
        if (typeof rawData !== 'string') {
            return
        }

        const parsed = parseWebSocketData(rawData)

        if (!parsed) {
            return
        }

        if (isWebSocketError(parsed)) {
            rejectPendingRequests(new Error(parsed.message))
            return
        }

        if (!isProjectWebSocketResponse(parsed)) {
            return
        }

        const pendingRequest = pendingWebSocketRequests.get(parsed.requestId)

        if (!pendingRequest) {
            return
        }

        pendingWebSocketRequests.delete(parsed.requestId)
        pendingRequest.resolve(parsed.data)
    }

    function parseWebSocketData(data: string) {
        try {
            return JSON.parse(data) as unknown
        }
        catch {
            return null
        }
    }

    function createRequestId() {
        requestIdCounter += 1

        return `${Date.now()}-${requestIdCounter}`
    }

    function rejectPendingRequests(error: Error) {
        for (const pendingRequest of pendingWebSocketRequests.values()) {
            pendingRequest.reject(error)
        }

        pendingWebSocketRequests.clear()
    }

    function isWebSocketError(value: unknown): value is { message: string, type: 'error' } {
        if (!value || typeof value !== 'object') {
            return false
        }

        const record = value as Record<string, unknown>

        return record.type === 'error' && typeof record.message === 'string'
    }

    function isProjectWebSocketResponse(value: unknown): value is ProjectWebSocketResponse {
        if (!value || typeof value !== 'object') {
            return false
        }

        const record = value as Record<string, unknown>

        return typeof record.requestId === 'string' && 'data' in record
    }

    function resetProjectModules() {
        for (const module of PROJECT_USAGE_DATA_MODULES) {
            getProjectModuleState(module).value = null
            loadingModules[module] = false
        }
    }

    function setProjectModulesData(response: ProjectUsageDataModulesResponse) {
        for (const module of PROJECT_USAGE_DATA_MODULES) {
            const payload = response.modules[module]
            if (payload) {
                getProjectModuleState(module).value = payload as ProjectModuleStateMap[typeof module]['value']
            }
        }
    }

    function isModuleLoaded(module: ProjectUsageDataModule) {
        return getProjectModuleState(module).value !== null
    }

    function getPlatformModulePayload<TModule extends keyof ProjectModulePayloadMap>(
        module: TModule,
        platform: ProjectDashboardScope,
    ): ProjectModulePayloadMap[TModule] {
        return getProjectModuleState(module).value?.[platform] ?? projectModuleDefaults[module]
    }

    function getProjectModuleState<TModule extends keyof ProjectModulePayloadMap>(module: TModule) {
        return projectModules[module] as ProjectModuleStateMap[TModule]
    }

    function getDailySeriesPoints(platform: ProjectUsagePlatform, labels: string[]) {
        const usageByDate = new Map(getPlatformModulePayload('daily_trend', platform).dailyTokenUsage.map(item => [item.date, item.totalTokens]))

        return labels.map(label => usageByDate.get(label) ?? 0)
    }

    return {
        activeScopeItems,
        activeTab,
        allDailyUsageRows,
        allModelChart,
        allOverviewCards,
        allSessionRows,
        dailySeries,
        dailyTooltipLabels,
        dailyTrendLabels,
        isModuleLoaded,
        isProjectModuleLoading,
        isProjectSelectDisabled,
        isScopeReady,
        platformTabs,
        platformViews,
        projects,
        selectedProjectId,
        tabSummaries,
        tabs,
        websocketError,
    }
}
