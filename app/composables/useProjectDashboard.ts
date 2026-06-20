import type { ProjectUsagePlatform } from '#shared/types/ai'
import type { PaginatedResponse } from '#shared/types/pagination'
import type {
    ProjectDailyTrendModulePayload,
    ProjectDashboardPlatformTab,
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
    ProjectTokenUsageRow,
} from '#shared/types/project-dashboard'
import type {
    ProjectUsageCatalogItem,
    ProjectUsageDataModule,
    ProjectUsageDataModulesResponse,
    ProjectWebSocketRequest,
    UsageUpdateMessage,
} from '#shared/types/ws'
import type { ShallowRef } from 'vue'
import { PROJECT_USAGE_PLATFORM_META } from '#shared/platform/metadata'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'
import { DEFAULT_PAGE_SIZE } from '#shared/types/pagination'
import { PROJECT_USAGE_DATA_MODULES } from '#shared/types/ws'
import { createEmptyPaginationMeta } from '#shared/utils/analysis-dashboard'
import { parse } from '#shared/utils/parse'
import {
    buildMonthlyTickIndexes,
    buildProjectDailyModelUsageChart,
    buildProjectOverviewCards,
    buildProjectPlatformOverviewCards,
    buildRecentDateLabels,
    summarizeProjectSessions,
    toProjectSessionTableRow,
    toProjectSessionTableRows,
} from '#shared/utils/project-dashboard'
import {
    formatCompactNumber,
    formatCurrency,
} from '#shared/utils/usage-dashboard'
import { inferUsageSessionIdentityPlatform } from '#shared/utils/usage-identity'
import {
    isProjectWebSocketResponse,
    isUsageUpdateMessage,
    isWebSocketError,
} from '#shared/utils/ws'
import { formatNumber } from '@lonewolfyx/utils'

const recentProjectDays = 30
const yearlyProjectDays = 365
const projectSelectionDebounceMs = 180
const projectSelectionMaxWaitMs = 600
const projectRealtimeRefreshDebounceMs = 300
const websocketRequestTimeoutMs = 45_000

const emptyDailyTrendPayload: ProjectDailyTrendModulePayload = {
    dailyRows: [],
    dailyTokenUsage: [],
}

const emptyModelUsagePayload: ProjectModelUsageModulePayload = {
    dailyTokenUsage: [],
    monthlyModelUsage: [],
}

const emptyTokenUsagePayload: ProjectTokenUsageModulePayload = {
    dailyRows: createEmptyPaginatedResponse(),
    monthlyRows: createEmptyPaginatedResponse(),
    sessionRows: createEmptyPaginatedResponse(),
    weeklyRows: createEmptyPaginatedResponse(),
}

const emptySessionListPayload: ProjectSessionListModulePayload = {
    sessionRows: createEmptyPaginatedResponse(),
    sessionUsage: createEmptyPaginatedResponse(),
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

function createEmptyPaginatedResponse<T>(): PaginatedResponse<T> {
    return {
        items: [],
        pagination: createEmptyPaginationMeta(),
    }
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
    let realtimeRefreshTimer: ReturnType<typeof setTimeout> | null = null
    const pendingWebSocketRequests = new Map<string, ProjectPendingWebSocketRequest>()

    const wsUrl = useWebSocketUrl()

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
        platforms: project.platforms,
        totalTokens: project.totalTokens,
    })))
    const selectedProject = computed(() =>
        projects.value.find(project => project.id === selectedProjectId.value) ?? null,
    )
    const isProjectModuleLoading = computed(() => PROJECT_USAGE_DATA_MODULES.some(module => loadingModules[module]))
    const isProjectSelectDisabled = computed(() => catalogLoading.value || isProjectModuleLoading.value || projects.value.length === 0)
    const isScopeReady = computed(() => isModuleLoaded('session_list'))
    const platformTabs = computed<ProjectDashboardPlatformTab[]>(() => {
        const visiblePlatforms = isModuleLoaded('session_list')
            ? PROJECT_USAGE_PLATFORMS.filter(platform => getPlatformModulePayload('session_list', platform).sessions.length > 0)
            : selectedProject.value?.platforms ?? []

        if (visiblePlatforms.length === 0) {
            return []
        }

        return visiblePlatforms.map(platform => ({
            ...PROJECT_USAGE_PLATFORM_META[platform],
            value: platform,
        }))
    })
    const tabs = computed(() => [
        { label: 'All', value: 'all' as const },
        ...platformTabs.value,
    ])
    const tabSummaries = computed<Record<ProjectDashboardScope, ProjectTabSummary>>(() => Object.fromEntries(
        tabs.value.map((tab) => {
            const summary = summarizeProjectSessions(
                tab.value === 'all'
                    ? getPlatformModulePayload('session_list', 'all').sessions
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
    const allOverviewCards = computed(() => buildProjectOverviewCards(getPlatformModulePayload('session_list', 'all').sessions))
    const allSessionRowsPage = computed<PaginatedResponse<ProjectSessionTableRow>>(() => {
        const sessionListPayload = getPlatformModulePayload('session_list', 'all')

        return {
            items: sessionListPayload.sessionUsage.items.map(session => toProjectSessionTableRow(session, inferSessionPlatform(session.id), session.id)),
            pagination: sessionListPayload.sessionUsage.pagination,
        }
    })
    const allDailyUsageRowsPage = computed<PaginatedResponse<ProjectTokenUsageRow>>(() => toProjectTokenUsagePage(
        getPlatformModulePayload('token_usage', 'all').dailyRows,
    ))
    const dailyTrendLabels = computed(() => recentDayLabels.value)
    const dailyTooltipLabels = computed(() => dailyTrendLabels.value)
    const dailySeries = computed<ProjectLineSeries[]>(() => platformTabs.value.map(tab => ({
        color: tab.color,
        label: tab.label,
        points: getDailySeriesPoints(tab.value, dailyTrendLabels.value),
    })))
    const allModelChart = computed(() => buildProjectDailyModelUsageChart(
        getPlatformModulePayload('model_usage', 'all').dailyTokenUsage,
        recentDayLabels.value,
    ))
    const platformViews = computed<Record<ProjectUsagePlatform, ProjectPlatformView>>(() => Object.fromEntries(
        PROJECT_USAGE_PLATFORMS.map((platform) => {
            const trendLabels = yearlyDayLabels.value
            const dailyTrendPayload = getPlatformModulePayload('daily_trend', platform)
            const modelUsagePayload = getPlatformModulePayload('model_usage', platform)
            const tokenUsagePayload = getPlatformModulePayload('token_usage', platform)
            const sessionListPayload = getPlatformModulePayload('session_list', platform)
            const modelChart = buildProjectDailyModelUsageChart(modelUsagePayload.dailyTokenUsage, trendLabels)

            return [platform, {
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
                sessionTableRows: {
                    items: toProjectSessionTableRows(sessionListPayload.sessionUsage.items, platform),
                    pagination: sessionListPayload.sessionUsage.pagination,
                },
                trendLabels,
                trendSeries: [{
                    color: PROJECT_USAGE_PLATFORM_META[platform].color,
                    label: PROJECT_USAGE_PLATFORM_META[platform].label,
                    points: getDailySeriesPoints(platform, trendLabels),
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
        if (realtimeRefreshTimer) {
            clearTimeout(realtimeRefreshTimer)
            realtimeRefreshTimer = null
        }

        rejectPendingRequests(new Error('Project dashboard disposed.'))
    })

    watch(selectedProjectId, (projectId) => {
        invalidateProjectModuleLoad()

        if (!projectId) {
            resetProjectModules()
        }
    })

    watch(tabs, (nextTabs) => {
        if (activeTab.value === 'all') {
            return
        }

        if (!nextTabs.some(tab => tab.value === activeTab.value)) {
            activeTab.value = 'all'
        }
    }, {
        immediate: true,
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
                page: 1,
                pageSize: DEFAULT_PAGE_SIZE,
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

        const parsed = parse(rawData)

        if (!parsed) {
            return
        }

        if (isWebSocketError(parsed)) {
            rejectPendingRequests(new Error(parsed.message))
            return
        }

        if (isUsageUpdateMessage(parsed)) {
            scheduleRealtimeRefresh(parsed.payload)
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

    function scheduleRealtimeRefresh(update: UsageUpdateMessage['payload']) {
        if (realtimeRefreshTimer) {
            clearTimeout(realtimeRefreshTimer)
        }

        realtimeRefreshTimer = setTimeout(() => {
            realtimeRefreshTimer = null
            void refreshProjectDashboardFromUsageUpdate(update)
        }, projectRealtimeRefreshDebounceMs)
    }

    async function refreshProjectDashboardFromUsageUpdate(update: UsageUpdateMessage['payload']) {
        const previousProjectId = selectedProjectId.value

        await loadProjectCatalog()

        const nextProjectId = selectedProjectId.value

        if (!nextProjectId || nextProjectId !== previousProjectId) {
            return
        }

        const shouldRefreshSelectedProject = update.affectedProjects.length === 0
            || update.affectedProjects.includes(nextProjectId)

        if (!shouldRefreshSelectedProject) {
            return
        }

        await loadProjectModules(nextProjectId)
    }

    function resetProjectModules() {
        for (const module of PROJECT_USAGE_DATA_MODULES) {
            const projectModule = projectModules[module] as ProjectModuleStateMap[typeof module]
            projectModule.value = null
            loadingModules[module] = false
        }
    }

    function setProjectModulesData(response: ProjectUsageDataModulesResponse) {
        for (const module of PROJECT_USAGE_DATA_MODULES) {
            const payload = response.modules[module]
            if (payload) {
                const projectModule = projectModules[module] as ProjectModuleStateMap[typeof module]
                projectModule.value = payload as ProjectModuleStateMap[typeof module]['value']
            }
        }
    }

    function isModuleLoaded(module: ProjectUsageDataModule) {
        return (projectModules[module] as ProjectModuleStateMap[typeof module]).value !== null
    }

    function getPlatformModulePayload<TModule extends keyof ProjectModulePayloadMap>(
        module: TModule,
        platform: ProjectDashboardScope,
    ): ProjectModulePayloadMap[TModule] {
        return (projectModules[module] as ProjectModuleStateMap[TModule]).value?.[platform] ?? projectModuleDefaults[module]
    }

    function getDailySeriesPoints(platform: ProjectUsagePlatform, labels: string[]) {
        const usageByDate = new Map(getPlatformModulePayload('daily_trend', platform).dailyTokenUsage.map(item => [item.date, item.totalTokens]))

        return labels.map(label => usageByDate.get(label) ?? 0)
    }

    function inferSessionPlatform(sessionId: string) {
        return inferUsageSessionIdentityPlatform(sessionId) ?? PROJECT_USAGE_PLATFORMS[0]!
    }

    async function fetchProjectTokenUsagePage(platform: ProjectDashboardScope, page: number) {
        const projectId = selectedProjectId.value

        if (!projectId) {
            return emptyTokenUsagePayload.dailyRows
        }

        const response = await sendWebSocketRequest<ProjectUsageDataModulesResponse>({
            modules: ['token_usage'],
            page,
            pageSize: DEFAULT_PAGE_SIZE,
            platform,
            project: projectId,
            type: 'project_data',
        })
        const tokenUsage = response.modules.token_usage?.[platform] ?? emptyTokenUsagePayload

        setProjectModulePayload('token_usage', platform, tokenUsage)

        return tokenUsage.dailyRows
    }

    function toProjectTokenUsagePage(page: PaginatedResponse<UsageAnalyticsTokenUsageRow>): PaginatedResponse<ProjectTokenUsageRow> {
        return {
            items: page.items.map(row => ({
                cacheTokens: formatNumber(row.cachedInputTokens),
                cost: formatCurrency(row.costUSD),
                inputTokens: formatNumber(row.inputTokens),
                label: row.label,
                models: row.models.join(', ') || '-',
                outputTokens: formatNumber(row.outputTokens),
                reasoningTokens: formatNumber(row.reasoningOutputTokens),
                sessions: String(row.sessionCount),
                tokens: formatNumber(row.totalTokens),
            })),
            pagination: page.pagination,
        }
    }

    async function fetchProjectSessionListPage(platform: ProjectDashboardScope, page: number) {
        const projectId = selectedProjectId.value

        if (!projectId) {
            return emptySessionListPayload.sessionUsage
        }

        const response = await sendWebSocketRequest<ProjectUsageDataModulesResponse>({
            modules: ['session_list'],
            page,
            pageSize: DEFAULT_PAGE_SIZE,
            platform,
            project: projectId,
            type: 'project_data',
        })
        const sessionList = response.modules.session_list?.[platform] ?? emptySessionListPayload

        setProjectModulePayload('session_list', platform, sessionList)

        return sessionList.sessionUsage
    }

    function setProjectModulePayload<TModule extends keyof ProjectModulePayloadMap>(
        module: TModule,
        platform: ProjectDashboardScope,
        payload: ProjectModulePayloadMap[TModule],
    ) {
        const projectModule = projectModules[module] as ProjectModuleStateMap[TModule]
        projectModule.value = {
            ...(projectModule.value ?? {}),
            [platform]: payload,
        } as ProjectModuleStateMap[TModule]['value']
    }

    return {
        activeScopeItems,
        activeTab,
        allDailyUsageRowsPage,
        allModelChart,
        allOverviewCards,
        allSessionRowsPage,
        dailySeries,
        dailyTooltipLabels,
        dailyTrendLabels,
        fetchProjectSessionListPage,
        fetchProjectTokenUsagePage,
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
