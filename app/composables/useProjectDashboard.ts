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
    ProjectUsageDataModuleResponse,
    ProjectWebSocketRequest,
    ProjectWebSocketResponse,
} from '#shared/types/ws'
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
    buildSessionDailyRows,
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

export function useProjectDashboard() {
    const selectedProjectId = shallowRef('')
    const activeTab = shallowRef<ProjectDashboardScope>('all')
    const catalogLoading = shallowRef(false)
    const projectCatalog = shallowRef<ProjectUsageCatalogItem[]>([])
    const websocketError = shallowRef('')
    const metaModule = shallowRef<ProjectMetaModule | null>(null)
    const dailyTrendModule = shallowRef<ProjectPlatformModulePayload<ProjectDailyTrendModulePayload> | null>(null)
    const modelUsageModule = shallowRef<ProjectPlatformModulePayload<ProjectModelUsageModulePayload> | null>(null)
    const tokenUsageModule = shallowRef<ProjectPlatformModulePayload<ProjectTokenUsageModulePayload> | null>(null)
    const sessionListModule = shallowRef<ProjectPlatformModulePayload<ProjectSessionListModulePayload> | null>(null)
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
    let requestChain: Promise<unknown> = Promise.resolve()
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
            const summary = summarizeProjectSessions(getSessionPayload(tab.value).sessions)

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
    const allOverviewCards = computed(() => buildProjectOverviewCards(getSessionPayload('all').sessions))
    const allDailyUsageRows = computed(() => toProjectDisplayDailyUsageRows(
        getDailyTrendPayload('all').dailyTokenUsage,
        getSessionPayload('all').sessions,
    ))
    const allSessionRows = computed(() => platformTabs
        .flatMap(tab => getSessionPayload(tab.value).sessions.map(session => ({
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
        getModelUsagePayload('all').dailyTokenUsage,
        recentDayLabels.value,
    ))
    const platformViews = computed<Record<ProjectDashboardPlatformKey, ProjectPlatformView>>(() => Object.fromEntries(
        platformTabs.map((tab) => {
            const trendLabels = yearlyDayLabels.value
            const modelChart = buildProjectDailyModelUsageChart(getModelUsagePayload(tab.value).dailyTokenUsage, trendLabels)

            return [tab.value, {
                modelLabels: modelChart.labels,
                modelSeries: modelChart.series,
                modelTickIndexes: yearlyTickIndexes.value,
                dayRows: buildSessionDailyRows(getSessionPayload(tab.value).sessions),
                monthRows: getTokenUsagePayload(tab.value).monthlyRows,
                overviewCards: buildProjectPlatformOverviewCards(
                    getSessionPayload(tab.value).sessions,
                    getDailyTrendPayload(tab.value).dailyTokenUsage,
                ),
                sessionRows: getTokenUsagePayload(tab.value).sessionRows,
                sessionTableRows: toProjectSessionTableRows(getSessionPayload(tab.value).sessions, tab.value),
                trendLabels,
                trendSeries: [{
                    color: tab.color,
                    label: tab.label,
                    points: getDailySeriesPoints(tab.value, trendLabels),
                }],
                trendTickIndexes: yearlyTickIndexes.value,
                trendTooltipLabels: trendLabels,
                weekRows: getTokenUsagePayload(tab.value).weeklyRows,
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

        return runQueuedRequest<ProjectUsageCatalogItem[]>({ type: 'project' })
            .then((catalog) => {
                projectCatalog.value = catalog
                const existingProject = catalog.find(project => project.label === selectedProjectId.value)
                selectedProjectId.value = existingProject?.label ?? catalog[0]?.label ?? ''
            })
            .catch((error) => {
                websocketError.value = error.message
            })
            .finally(() => {
                catalogLoading.value = false
            })
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
        await loadProjectModulesRecursively(project, projectModuleLoadOrder, 0, runId)
    }

    async function loadProjectModulesRecursively(
        project: ProjectSelectItem,
        modules: readonly ProjectUsageDataModule[],
        index: number,
        runId: number,
    ): Promise<void> {
        if (index >= modules.length || runId !== moduleLoadRunId) {
            return
        }

        const module = modules[index]!
        loadingModules[module] = true

        try {
            const response = await runQueuedRequest<ProjectUsageDataModuleResponse<typeof module>>({
                module,
                path: project.path,
                project: project.id,
                type: 'project_data',
            })

            if (runId !== moduleLoadRunId || response.label !== project.id) {
                return
            }

            setProjectModuleData(response)
        }
        catch (error) {
            if (runId !== moduleLoadRunId) {
                return
            }

            websocketError.value = error instanceof Error ? error.message : 'Failed to load project module.'
        }
        finally {
            if (runId === moduleLoadRunId) {
                loadingModules[module] = false
            }
        }

        await loadProjectModulesRecursively(project, modules, index + 1, runId)
    }

    function runQueuedRequest<T>(payload: ProjectWebSocketRequest): Promise<T> {
        const task = requestChain.then(() => sendWebSocketRequest<T>(payload))
        requestChain = task.catch(() => undefined)

        return task
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
        metaModule.value = null
        dailyTrendModule.value = null
        modelUsageModule.value = null
        tokenUsageModule.value = null
        sessionListModule.value = null

        for (const module of projectModuleLoadOrder) {
            loadingModules[module] = false
        }
    }

    function setProjectModuleData(response: ProjectUsageDataModuleResponse) {
        if (response.module === 'meta') {
            metaModule.value = response.data
            return
        }

        if (response.module === 'daily_trend') {
            dailyTrendModule.value = response.data
            return
        }

        if (response.module === 'model_usage') {
            modelUsageModule.value = response.data
            return
        }

        if (response.module === 'token_usage') {
            tokenUsageModule.value = response.data
            return
        }

        if (response.module === 'session_list') {
            sessionListModule.value = response.data
        }
    }

    function isModuleLoaded(module: ProjectUsageDataModule) {
        if (module === 'meta') {
            return metaModule.value !== null
        }

        if (module === 'daily_trend') {
            return dailyTrendModule.value !== null
        }

        if (module === 'model_usage') {
            return modelUsageModule.value !== null
        }

        if (module === 'token_usage') {
            return tokenUsageModule.value !== null
        }

        if (module === 'session_list') {
            return sessionListModule.value !== null
        }

        return false
    }

    function getDailyTrendPayload(platform: ProjectDashboardScope) {
        return dailyTrendModule.value?.[platform] ?? emptyDailyTrendPayload
    }

    function getModelUsagePayload(platform: ProjectDashboardScope) {
        return modelUsageModule.value?.[platform] ?? emptyModelUsagePayload
    }

    function getTokenUsagePayload(platform: ProjectDashboardScope) {
        return tokenUsageModule.value?.[platform] ?? emptyTokenUsagePayload
    }

    function getSessionPayload(platform: ProjectDashboardScope) {
        return sessionListModule.value?.[platform] ?? emptySessionListPayload
    }

    function getDailySeriesPoints(platform: ProjectDashboardPlatformKey, labels: string[]) {
        const usageByDate = new Map(getDailyTrendPayload(platform).dailyTokenUsage.map(item => [item.date, item.totalTokens]))

        return labels.map(label => usageByDate.get(label) ?? 0)
    }

    return {
        activeScopeItems,
        activeTab,
        allDailyUsageRows,
        allModelChart,
        allOverviewCards,
        allSessionRows,
        catalogLoading,
        dailySeries,
        dailyTooltipLabels,
        dailyTrendLabels,
        isModuleLoaded,
        isProjectModuleLoading,
        isProjectSelectDisabled,
        isScopeReady,
        loadingModules,
        metaModule,
        platformTabs,
        platformViews,
        projects,
        selectedProjectId,
        tabSummaries,
        tabs,
        websocketError,
    }
}
