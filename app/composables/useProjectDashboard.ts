import type {
    ProjectDailyTrendModulePayload,
    ProjectDashboardPlatformKey,
    ProjectDashboardScope,
    ProjectLineSeries,
    ProjectMetaModule,
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
} from '#shared/utils/usage-dashboard'

const projectModuleLoadOrder = [
    'meta',
    'daily_trend',
    'model_usage',
    'token_usage',
    'session_list',
] satisfies ProjectUsageDataModule[]

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

interface ProjectModuleStateMap {
    daily_trend: ShallowRef<ProjectPlatformModulePayload<ProjectDailyTrendModulePayload> | null>
    meta: ShallowRef<ProjectMetaModule | null>
    model_usage: ShallowRef<ProjectPlatformModulePayload<ProjectModelUsageModulePayload> | null>
    session_list: ShallowRef<ProjectPlatformModulePayload<ProjectSessionListModulePayload> | null>
    token_usage: ShallowRef<ProjectPlatformModulePayload<ProjectTokenUsageModulePayload> | null>
}

interface ProjectPlatformModulePayloadMap {
    daily_trend: ProjectDailyTrendModulePayload
    model_usage: ProjectModelUsageModulePayload
    session_list: ProjectSessionListModulePayload
    token_usage: ProjectTokenUsageModulePayload
}

export function useProjectDashboard() {
    const selectedProjectId = shallowRef('')
    const activeTab = shallowRef<ProjectDashboardScope>('all')
    const catalogLoading = shallowRef(false)
    const projectCatalog = shallowRef<ProjectUsageCatalogItem[]>([])
    const websocketError = shallowRef('')
    const projectModules: ProjectModuleStateMap = {
        daily_trend: shallowRef<ProjectPlatformModulePayload<ProjectDailyTrendModulePayload> | null>(null),
        meta: shallowRef<ProjectMetaModule | null>(null),
        model_usage: shallowRef<ProjectPlatformModulePayload<ProjectModelUsageModulePayload> | null>(null),
        session_list: shallowRef<ProjectPlatformModulePayload<ProjectSessionListModulePayload> | null>(null),
        token_usage: shallowRef<ProjectPlatformModulePayload<ProjectTokenUsageModulePayload> | null>(null),
    }
    const platformModuleDefaults: ProjectPlatformModulePayloadMap = {
        daily_trend: emptyDailyTrendPayload,
        model_usage: emptyModelUsagePayload,
        session_list: emptySessionListPayload,
        token_usage: emptyTokenUsagePayload,
    }
    const loadingModules = reactive<Record<ProjectUsageDataModule, boolean>>({
        daily_trend: false,
        meta: false,
        model_usage: false,
        overview_cards: false,
        session_interactions: false,
        session_list: false,
        token_usage: false,
    })

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
        path: project.path,
        type: project.type,
    })))
    const isProjectModuleLoading = computed(() => projectModuleLoadOrder.some(module => loadingModules[module]))
    const isProjectSelectDisabled = computed(() => catalogLoading.value || isProjectModuleLoading.value || projects.value.length === 0)
    const isScopeReady = computed(() => isModuleLoaded('session_list'))
    const tabSummaries = computed<Record<ProjectDashboardScope, ProjectTabSummary>>(() => Object.fromEntries(
        tabs.map((tab) => {
            const summary = summarizeProjectSessions(getPlatformModulePayload('session_list', tab.value).sessions)

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
    const allOverviewCards = computed(() => buildProjectOverviewCards(getPlatformModulePayload('session_list', 'all').sessions))
    const allDailyUsageRows = computed(() => toProjectDisplayDailyUsageRows(
        getPlatformModulePayload('daily_trend', 'all').dailyTokenUsage,
        getPlatformModulePayload('session_list', 'all').sessions,
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
        getPlatformModulePayload('model_usage', 'all').dailyTokenUsage,
        recentDayLabels.value,
    ))
    const platformViews = computed<Record<ProjectDashboardPlatformKey, ProjectPlatformView>>(() => Object.fromEntries(
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
    ) as Record<ProjectDashboardPlatformKey, ProjectPlatformView>)

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
        for (const module of projectModuleLoadOrder) {
            loadingModules[module] = true
        }

        try {
            const response = await sendWebSocketRequest<ProjectUsageDataModulesResponse>({
                modules: [...projectModuleLoadOrder],
                path: project.path,
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
                for (const module of projectModuleLoadOrder) {
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
        for (const module of projectModuleLoadOrder) {
            projectModules[module].value = null
        }

        for (const module of projectModuleLoadOrder) {
            loadingModules[module] = false
        }
    }

    function setProjectModulesData(response: ProjectUsageDataModulesResponse) {
        for (const module of projectModuleLoadOrder) {
            const payload = response.modules[module]
            if (payload) {
                projectModules[module].value = payload as ProjectModuleStateMap[typeof module]['value']
            }
        }
    }

    function isModuleLoaded(module: ProjectUsageDataModule) {
        return module in projectModules
            ? projectModules[module as keyof ProjectModuleStateMap].value !== null
            : false
    }

    function getPlatformModulePayload<TModule extends keyof ProjectPlatformModulePayloadMap>(
        module: TModule,
        platform: ProjectDashboardScope,
    ) {
        return projectModules[module].value?.[platform] ?? platformModuleDefaults[module]
    }

    function getDailySeriesPoints(platform: ProjectDashboardPlatformKey, labels: string[]) {
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
