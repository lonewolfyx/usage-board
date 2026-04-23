<template>
    <Tabs v-model="activeTab">
        <div class="relative flex flex-col border-b z-10 pb-5 mb-5">
            <div class="container mx-auto flex flex-col gap-3">
                <div class="relative flex justify-between items-stretch">
                    <div
                        :class="cn(
                            'before:content-[\' \'] before:absolute',
                            'before:w-1 before:h-full',
                            'before:rounded-full',
                            'before:bg-amber-500',
                        )"
                    >
                        <Select v-model="selectedProjectId" :disabled="catalogLoading || projects.length === 0">
                            <SelectTrigger
                                aria-label="Select Project"
                                :class="cn(
                                    'bg-transparent border-0 px-0 py-0 font-semibold',
                                    'tracking-tight shadow-none focus-visible:ring-0',
                                    'ml-4',
                                )"
                            >
                                <SelectValue placeholder="Choose project" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem
                                    v-for="project in projects"
                                    :key="project.id"
                                    :value="project.id"
                                >
                                    {{ project.name }}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div class="flex justify-between items-center">
                    <TabsList
                        aria-label="Project platform scope"
                        class="flex h-auto justify-start bg-transparent gap-5"
                    >
                        <TabsTrigger
                            v-for="tab in tabs"
                            :key="tab.value"
                            :aria-label="tab.label"
                            :value="tab.value"
                            class="flex justify-start gap-3 shadow-none"
                            :class="cn(
                                'data-[state=active]:border',
                                'data-[state=active]:border-dashed',
                                'data-[state=active]:border-amber-500',
                                'data-[state=active]:bg-transparent',
                            )"
                        >
                            <Icon
                                v-if="tab.value === 'all'"
                                aria-hidden="true"
                                class="size-4 text-muted-foreground"
                                mode="svg"
                                name="lucide:layout-dashboard"
                            />
                            <IconAi v-else class="flex items-center [&_svg]:size-5!" :name="tab.aiIcon!" />

                            <div class="min-w-0 flex-1">
                                <div class="flex flex-col items-start gap-1.5">
                                    <div class="w-full flex justify-between items-center">
                                        <span class="truncate text-sm font-medium">{{ tab.label }}</span>
                                    </div>
                                    <Skeleton v-if="!isScopeReady" class="h-3 w-20" />
                                    <span v-else class="block truncate text-xs text-muted-foreground tabular-nums">
                                        {{ tabSummaries[tab.value].tokens }} tokens
                                    </span>
                                </div>
                            </div>
                        </TabsTrigger>
                    </TabsList>
                    <div class="grid grid-cols-3 gap-4">
                        <div
                            v-for="item in activeScopeItems"
                            :key="item.label"
                            class="flex flex-col items-start gap-3 rounded-md border border-dotted px-3 py-2"
                        >
                            <Skeleton v-if="!isScopeReady" class="h-5 w-16" />
                            <p v-else class="truncate text-sm font-semibold tabular-nums">
                                {{ item.value }}
                            </p>
                            <p class="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                {{ item.label }}
                            </p>
                        </div>
                    </div>
                </div>

                <p v-if="websocketError" class="text-xs text-destructive">
                    {{ websocketError }}
                </p>
            </div>
        </div>

        <DashboardPage>
            <TabsContent class="m-0" value="all">
                <DashboardPanelGrid>
                    <DashboardOverviewCards
                        v-if="isModuleLoaded('session_list')"
                        :cards="allOverviewCards"
                        class="md:col-span-12 lg:grid-cols-5"
                    />
                    <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 md:col-span-12">
                        <Skeleton v-for="index in 5" :key="index" class="h-28 rounded-md" />
                    </div>

                    <StatisticalAnalysisPanel
                        class="md:col-span-12"
                        description="Recent usage by provider"
                        icon="lucide:activity"
                        title="Daily Token Trend"
                    >
                        <DashboardProjectLineChart
                            v-if="isModuleLoaded('model_usage')"
                            :series="dailySeries"
                            :tooltip-labels="dailyTooltipLabels"
                            :x-labels="dailyTrendLabels"
                        />
                        <Skeleton v-else class="h-80 w-full rounded-md" />
                    </StatisticalAnalysisPanel>

                    <StatisticalAnalysisPanel
                        class="md:col-span-12"
                        description="Usage by model"
                        icon="solar:cpu-line-duotone"
                        title="Model Usage"
                    >
                        <DashboardProjectLineChart
                            v-if="isModuleLoaded('model_usage')"
                            :series="allModelChart.series"
                            :tooltip-labels="allModelChart.labels"
                            :x-labels="allModelChart.labels"
                        />
                        <Skeleton v-else class="h-80 w-full rounded-md" />
                    </StatisticalAnalysisPanel>

                    <StatisticalAnalysisPanel
                        class="md:col-span-12"
                        description="Sessions in this project"
                        icon="lucide:messages-square"
                        title="Session Statistics"
                    >
                        <DashboardProjectSessionTable v-if="isModuleLoaded('session_list')" :items="allSessionRows" />
                        <Skeleton v-else class="h-72 w-full rounded-md" />
                    </StatisticalAnalysisPanel>

                    <StatisticalAnalysisPanel
                        class="md:col-span-12"
                        description="Daily model activity by token type, cache reads, total usage, and cost"
                        icon="lucide:calendar-days"
                        title="Daily Token Usage"
                    >
                        <DashboardProjectTokenUsageTable v-if="isModuleLoaded('daily_trend')" :items="allDailyUsageRows" />
                        <Skeleton v-else class="h-72 w-full rounded-md" />
                    </StatisticalAnalysisPanel>
                </DashboardPanelGrid>
            </TabsContent>

            <TabsContent
                v-for="tab in platformTabs"
                :key="tab.value"
                :value="tab.value"
                class="m-0"
            >
                <DashboardPanelGrid>
                    <div class="md:col-span-12">
                        <div v-if="isModuleLoaded('daily_trend') && isModuleLoaded('session_list')" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                            <StatisticalAnalysisTotalCard
                                v-for="card in platformViews[tab.value].overviewCards"
                                :key="card.name"
                                :icon="card.icon"
                                :name="card.name"
                                :trend="card.trend"
                                :trend-tone="card.trendTone"
                                :value="card.value"
                            />
                        </div>
                        <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                            <Skeleton v-for="index in 7" :key="index" class="h-28 rounded-md" />
                        </div>
                    </div>

                    <StatisticalAnalysisPanel
                        :description="`${tab.label} token usage within the current project`"
                        class="md:col-span-12"
                        icon="lucide:chart-area"
                        title="Token Trend"
                    >
                        <DashboardProjectLineChart
                            v-if="isModuleLoaded('daily_trend')"
                            :series="platformViews[tab.value].trendSeries"
                            :tick-indexes="platformViews[tab.value].trendTickIndexes"
                            :tooltip-labels="platformViews[tab.value].trendTooltipLabels"
                            :x-labels="platformViews[tab.value].trendLabels"
                        />
                        <Skeleton v-else class="h-80 w-full rounded-md" />
                    </StatisticalAnalysisPanel>

                    <StatisticalAnalysisPanel
                        :description="`${tab.label} model trend within the current project`"
                        class="md:col-span-12"
                        icon="solar:cpu-line-duotone"
                        title="Model Usage Trend"
                    >
                        <DashboardProjectLineChart
                            v-if="isModuleLoaded('daily_trend')"
                            :series="platformViews[tab.value].modelSeries"
                            :tick-indexes="platformViews[tab.value].modelTickIndexes"
                            :tooltip-labels="platformViews[tab.value].modelLabels"
                            :x-labels="platformViews[tab.value].modelLabels"
                        />
                        <Skeleton v-else class="h-80 w-full rounded-md" />
                    </StatisticalAnalysisPanel>

                    <UsageAnalyticsTokenUsageTabsPanel
                        v-if="isModuleLoaded('token_usage') && isModuleLoaded('session_list')"
                        class="md:col-span-12"
                        :daily-items="platformViews[tab.value].dayRows"
                        :monthly-items="platformViews[tab.value].monthRows"
                        :product-name="tab.label"
                        :session-items="platformViews[tab.value].sessionRows"
                        :weekly-items="platformViews[tab.value].weekRows"
                    />
                    <Skeleton v-else class="h-72 rounded-md md:col-span-12" />

                    <StatisticalAnalysisPanel
                        :description="`${tab.label} sessions in the current project`"
                        class="md:col-span-12"
                        icon="lucide:list-tree"
                        title="Session List"
                    >
                        <DashboardProjectSessionTable v-if="isModuleLoaded('session_list')" :items="platformViews[tab.value].sessionTableRows" />
                        <Skeleton v-else class="h-72 w-full rounded-md" />
                    </StatisticalAnalysisPanel>
                </DashboardPanelGrid>
            </TabsContent>
        </DashboardPage>
    </Tabs>
</template>

<script lang="ts" setup>
import type {
    LineSeries,
    PlatformKey,
    ProductPlatformKey,
    ProjectDashboardPlatformTab,
    ProjectDashboardTab,
    TokenUsageRow as ProjectTokenUsageRow,
    SessionTableRow,
    TabSummary,
} from '#shared/typed/project-dashboard'
import type {
    DailyTokenUsage,
    MonthlyModelUsage,
    ProjectSessionUsageItem,
    TokenUsageRow,
    UsageOverviewCard,
} from '#shared/types/usage-dashboard'
import type {
    ProjectUsageCatalogItem,
    ProjectUsageDataModule,
    ProjectUsageDataModuleResponse,
    ProjectWebSocketRequest,
    ProjectWebSocketResponse,
} from '#shared/types/ws'
import {
    buildGrowthTrend,
    buildPercentTrend,
    buildSessionDailyRows,
    formatCompactNumber,
    formatCurrency,
    formatDate,
    formatDateLabelFromDateKey,
    formatPercent,
    getDateKey,
} from '#shared/utils/usage-dashboard'
import { formatNumber } from '@lonewolfyx/utils'
import { cn } from '~/lib/utils'

type ProjectSessionListItem = Omit<ProjectSessionUsageItem, 'interactions'>

interface ProjectSelectItem {
    id: string
    name: string
    path: string[]
    type: ProjectUsageCatalogItem['type']
}

interface ProjectMetaModule {
    createTime: string | null
    label: string
    models: string[]
    platforms: ProductPlatformKey[]
    sessionCound: number
}

interface DailyTrendModulePayload {
    dailyRows: TokenUsageRow[]
    dailyTokenUsage: DailyTokenUsage[]
}

interface ModelUsageModulePayload {
    dailyTokenUsage: DailyTokenUsage[]
    monthlyModelUsage: MonthlyModelUsage[]
}

interface TokenUsageModulePayload {
    dailyRows: TokenUsageRow[]
    monthlyRows: TokenUsageRow[]
    sessionRows: TokenUsageRow[]
    weeklyRows: TokenUsageRow[]
}

interface SessionListModulePayload {
    sessionRows: TokenUsageRow[]
    sessionUsage: ProjectSessionListItem[]
    sessions: ProjectSessionListItem[]
}

type PlatformModulePayload<T> = Record<PlatformKey, T>

interface ProjectPlatformView {
    dayRows: TokenUsageRow[]
    modelLabels: string[]
    modelSeries: LineSeries[]
    modelTickIndexes: number[]
    monthRows: TokenUsageRow[]
    overviewCards: UsageOverviewCard[]
    sessionRows: TokenUsageRow[]
    sessionTableRows: SessionTableRow[]
    trendLabels: string[]
    trendSeries: LineSeries[]
    trendTickIndexes: number[]
    trendTooltipLabels: string[]
    weekRows: TokenUsageRow[]
}

interface PendingWebSocketRequest<T = unknown> {
    reject: (error: Error) => void
    requestId: string
    resolve: (value: T) => void
}

const selectedProjectId = shallowRef('')
const activeTab = shallowRef<PlatformKey>('all')
const catalogLoading = shallowRef(false)
const projectCatalog = shallowRef<ProjectUsageCatalogItem[]>([])
const websocketError = shallowRef('')
const metaModule = shallowRef<ProjectMetaModule | null>(null)
const dailyTrendModule = shallowRef<PlatformModulePayload<DailyTrendModulePayload> | null>(null)
const modelUsageModule = shallowRef<PlatformModulePayload<ModelUsageModulePayload> | null>(null)
const tokenUsageModule = shallowRef<PlatformModulePayload<TokenUsageModulePayload> | null>(null)
const sessionListModule = shallowRef<PlatformModulePayload<SessionListModulePayload> | null>(null)
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
const pendingWebSocketRequests = new Map<string, PendingWebSocketRequest>()

const tabs: ProjectDashboardTab[] = [
    { label: 'All', value: 'all' },
    { aiIcon: 'claude_code', color: '#d97757', label: 'Claude Code', value: 'claudeCode' },
    { aiIcon: 'codex', color: '#111827', label: 'Codex', value: 'codex' },
    { aiIcon: 'gemini', color: '#0ea5e9', label: 'Gemini', value: 'gemini' },
]
const platformTabs = tabs.filter((tab): tab is ProjectDashboardPlatformTab => tab.value !== 'all')
const projectModuleLoadOrder = [
    'meta',
    'daily_trend',
    'model_usage',
    'token_usage',
    'session_list',
] satisfies ProjectUsageDataModule[]
const modelSeriesColors = ['#2563eb', '#f97316', '#0891b2', '#7c3aed', '#16a34a', '#dc2626', '#64748b']
const recentProjectDays = 30
const yearlyProjectDays = 365
const projectSelectionDebounceMs = 180
const projectSelectionMaxWaitMs = 600
const websocketRequestTimeoutMs = 45_000
const emptyDailyTrendPayload: DailyTrendModulePayload = {
    dailyRows: [],
    dailyTokenUsage: [],
}
const emptyModelUsagePayload: ModelUsageModulePayload = {
    dailyTokenUsage: [],
    monthlyModelUsage: [],
}
const emptyTokenUsagePayload: TokenUsageModulePayload = {
    dailyRows: [],
    monthlyRows: [],
    sessionRows: [],
    weeklyRows: [],
}
const emptySessionListPayload: SessionListModulePayload = {
    sessionRows: [],
    sessionUsage: [],
    sessions: [],
}

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
const isScopeReady = computed(() => isModuleLoaded('session_list'))
const tabSummaries = computed<Record<PlatformKey, TabSummary>>(() => Object.fromEntries(tabs.map((tab) => {
    const summary = summarizeSessions(getSessionPayload(tab.value).sessions)

    return [tab.value, {
        cost: formatCurrency(summary.costUSD),
        label: tab.label,
        sessions: String(summary.sessions),
        tokens: formatCompactNumber(summary.totalTokens),
    }]
})) as Record<PlatformKey, TabSummary>)
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
const allOverviewCards = computed(() => buildAllOverviewCards(getSessionPayload('all').sessions))
const allDailyUsageRows = computed(() => toDisplayDailyUsageRows(
    getDailyTrendPayload('all').dailyTokenUsage,
    getSessionPayload('all').sessions,
))
const allSessionRows = computed(() => platformTabs.flatMap(tab => toSessionTableRows(getSessionPayload(tab.value).sessions, tab.value)))
const dailyTrendLabels = computed(() => recentDayLabels.value)
const dailyTooltipLabels = computed(() => dailyTrendLabels.value)
const dailySeries = computed<LineSeries[]>(() => platformTabs.map(tab => ({
    color: tab.color,
    label: tab.label,
    points: getDailySeriesPoints(tab.value, dailyTrendLabels.value),
})))
const allModelChart = computed(() => buildDailyModelUsageChart(getModelUsagePayload('all').dailyTokenUsage, recentDayLabels.value))
const platformViews = computed<Record<ProductPlatformKey, ProjectPlatformView>>(() => Object.fromEntries(platformTabs.map((tab) => {
    const trendLabels = yearlyDayLabels.value
    const modelChart = buildDailyModelUsageChart(getModelUsagePayload(tab.value).dailyTokenUsage, trendLabels)

    return [tab.value, {
        modelLabels: modelChart.labels,
        modelSeries: modelChart.series,
        modelTickIndexes: yearlyTickIndexes.value,
        dayRows: buildSessionDailyRows(getSessionPayload(tab.value).sessions),
        monthRows: getTokenUsagePayload(tab.value).monthlyRows,
        overviewCards: buildPlatformOverviewCards(
            getSessionPayload(tab.value).sessions,
            getDailyTrendPayload(tab.value).dailyTokenUsage,
        ),
        sessionRows: getTokenUsagePayload(tab.value).sessionRows,
        sessionTableRows: toSessionTableRows(getSessionPayload(tab.value).sessions, tab.value),
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
})) as Record<ProductPlatformKey, ProjectPlatformView>)

onMounted(() => {
    open()
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
        const response = await runQueuedRequest<ProjectUsageDataModuleResponse>({
            module,
            path: project.path,
            project: project.id,
            type: 'project_data',
        })

        if (runId !== moduleLoadRunId || response.label !== project.id) {
            return
        }

        setProjectModuleData(module, response.data)
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

function setProjectModuleData(module: ProjectUsageDataModule, data: unknown) {
    if (module === 'meta') {
        metaModule.value = data as ProjectMetaModule
    }
    else if (module === 'daily_trend') {
        dailyTrendModule.value = data as PlatformModulePayload<DailyTrendModulePayload>
    }
    else if (module === 'model_usage') {
        modelUsageModule.value = data as PlatformModulePayload<ModelUsageModulePayload>
    }
    else if (module === 'token_usage') {
        tokenUsageModule.value = data as PlatformModulePayload<TokenUsageModulePayload>
    }
    else if (module === 'session_list') {
        sessionListModule.value = data as PlatformModulePayload<SessionListModulePayload>
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

function getDailyTrendPayload(platform: PlatformKey) {
    return dailyTrendModule.value?.[platform] ?? emptyDailyTrendPayload
}

function getModelUsagePayload(platform: PlatformKey) {
    return modelUsageModule.value?.[platform] ?? emptyModelUsagePayload
}

function getTokenUsagePayload(platform: PlatformKey) {
    return tokenUsageModule.value?.[platform] ?? emptyTokenUsagePayload
}

function getSessionPayload(platform: PlatformKey) {
    return sessionListModule.value?.[platform] ?? emptySessionListPayload
}

function getDailySeriesPoints(platform: ProductPlatformKey, labels: string[]) {
    const usageByDate = new Map(getDailyTrendPayload(platform).dailyTokenUsage.map(item => [item.date, item.totalTokens]))

    return labels.map(label => usageByDate.get(label) ?? 0)
}

function buildAllOverviewCards(sessions: ProjectSessionListItem[]): UsageOverviewCard[] {
    const summary = summarizeUsage(sessions)

    return [
        {
            icon: 'solar:cpu-line-duotone',
            name: 'Total Tokens',
            trend: 'project total',
            trendTone: 'neutral',
            value: formatCompactNumber(summary.totalTokens),
        },
        {
            icon: 'lucide:wallet',
            name: 'Total Spend',
            trend: 'all time',
            trendTone: 'neutral',
            value: formatCurrency(summary.costUSD),
        },
        {
            icon: 'lucide:messages-square',
            name: 'Sessions',
            trend: 'all tools',
            trendTone: 'neutral',
            value: String(summary.sessions),
        },
        {
            icon: 'lucide:database-zap',
            name: 'Cache Hit Rate',
            trend: `${formatCompactNumber(summary.cachedInputTokens)} cached`,
            trendTone: 'neutral',
            value: formatPercent(summary.inputTokens > 0 ? summary.cachedInputTokens / summary.inputTokens : 0),
        },
        {
            icon: 'lucide:circle-dollar-sign',
            name: 'Avg Session Cost',
            trend: 'per session',
            trendTone: 'neutral',
            value: formatCurrency(summary.sessions > 0 ? summary.costUSD / summary.sessions : 0),
        },
    ]
}

function buildPlatformOverviewCards(
    sessions: ProjectSessionListItem[],
    dailyItems: DailyTokenUsage[],
): UsageOverviewCard[] {
    const summary = summarizeUsage(sessions)
    const todayLabel = buildRecentDateLabels(1)[0] ?? ''
    const yesterdayLabel = buildRecentDateLabels(2)[0] ?? ''
    const todayUsage = dailyItems.find(item => item.date === todayLabel)
    const yesterdayUsage = dailyItems.find(item => item.date === yesterdayLabel)
    const todaySessions = countSessionsByDate(sessions, todayLabel)
    const yesterdaySessions = countSessionsByDate(sessions, yesterdayLabel)
    const tokenTrend = buildGrowthTrend(todayUsage?.totalTokens ?? 0, yesterdayUsage?.totalTokens ?? 0, formatCompactNumber)
    const costTrend = buildGrowthTrend(todayUsage?.costUSD ?? 0, yesterdayUsage?.costUSD ?? 0, formatCurrency)
    const sessionTrend = buildPercentTrend(todaySessions, yesterdaySessions)

    return [
        {
            icon: 'solar:cpu-line-duotone',
            name: 'Today Tokens',
            trend: tokenTrend.trend,
            trendTone: tokenTrend.trendTone,
            value: formatCompactNumber(todayUsage?.totalTokens ?? 0),
        },
        {
            icon: 'lucide:wallet',
            name: 'Today Spend',
            trend: costTrend.trend,
            trendTone: costTrend.trendTone,
            value: formatCurrency(todayUsage?.costUSD ?? 0),
        },
        {
            icon: 'lucide:messages-square',
            name: 'Today Sessions',
            trend: sessionTrend.label,
            trendTone: sessionTrend.tone,
            value: String(todaySessions),
        },
        {
            icon: 'lucide:receipt-text',
            name: 'Total Spend',
            trend: 'all time',
            trendTone: 'neutral',
            value: formatCurrency(summary.costUSD),
        },
        {
            icon: 'lucide:list-checks',
            name: 'Sessions',
            trend: 'project total',
            trendTone: 'neutral',
            value: String(summary.sessions),
        },
        {
            icon: 'lucide:database-zap',
            name: 'Cache Hit Rate',
            trend: `${formatCompactNumber(summary.cachedInputTokens)} cached`,
            trendTone: 'neutral',
            value: formatPercent(summary.inputTokens > 0 ? summary.cachedInputTokens / summary.inputTokens : 0),
        },
        {
            icon: 'lucide:circle-dollar-sign',
            name: 'Avg Session Cost',
            trend: 'per session',
            trendTone: 'neutral',
            value: formatCurrency(summary.sessions > 0 ? summary.costUSD / summary.sessions : 0),
        },
    ]
}

function buildDailyModelUsageChart(items: DailyTokenUsage[], labels: string[]) {
    const labelSet = new Set(labels)
    const visibleItems = items.filter(item => labelSet.has(item.date))
    const models = uniqueItems(visibleItems.flatMap(item => Object.keys(item.models)))
        .map(model => ({
            model,
            totalTokens: visibleItems.reduce((sum, item) => sum + (item.models[model]?.totalTokens ?? 0), 0),
        }))
        .sort((a, b) => b.totalTokens - a.totalTokens || a.model.localeCompare(b.model))
        .map(item => item.model)
    const series = models.map((model, index): LineSeries => ({
        color: modelSeriesColors[index % modelSeriesColors.length]!,
        label: model,
        points: labels.map(label => items.find(item => item.date === label)?.models[model]?.totalTokens ?? 0),
    }))

    return { labels, series }
}

function buildRecentDateLabels(days: number) {
    const today = new Date()

    return Array.from({ length: days }, (_, index) => {
        const date = new Date(today)
        date.setHours(0, 0, 0, 0)
        date.setDate(today.getDate() - (days - 1 - index))

        return formatDateLabelFromDateKey(getDateKey(date))
    })
}

function buildMonthlyTickIndexes(labels: string[]) {
    return labels
        .map((label, index) => ({ date: new Date(label), index }))
        .filter(({ date, index }) => {
            if (index === 0 || index === labels.length - 1) {
                return true
            }

            return Number.isFinite(date.getTime()) && date.getUTCDate() === 1
        })
        .map(({ index }) => index)
}

function toDisplayDailyUsageRows(
    items: DailyTokenUsage[],
    sessions: ProjectSessionListItem[],
): ProjectTokenUsageRow[] {
    const sessionCountByDate = buildSessionCountByDate(sessions)

    return items.map(item => ({
        cacheTokens: formatNumber(item.cachedInputTokens),
        cost: formatCurrency(item.costUSD),
        inputTokens: formatNumber(item.inputTokens),
        label: item.date,
        models: Object.keys(item.models).sort((a, b) => a.localeCompare(b)).join(', ') || '-',
        outputTokens: formatNumber(item.outputTokens),
        reasoningTokens: formatNumber(item.reasoningOutputTokens),
        sessions: String(sessionCountByDate.get(item.date) ?? 0),
        tokens: formatNumber(item.totalTokens),
    }))
}

function toSessionTableRows(
    sessions: ProjectSessionListItem[],
    platform: ProductPlatformKey,
): SessionTableRow[] {
    return sessions.map(session => ({
        cacheTokens: formatNumber(session.cachedInputTokens),
        cost: formatCurrency(session.costUSD),
        duration: session.duration || '-',
        id: `${platform}:${session.sessionId}`,
        inputTokens: formatNumber(session.inputTokens),
        model: session.models?.join(', ') || session.model || 'unknown',
        outputTokens: formatNumber(session.outputTokens),
        platform,
        reasoningTokens: formatNumber(session.reasoningOutputTokens),
        startedAt: formatSafeDate(session.startedAt),
        title: session.threadName || session.sessionId,
        tokens: formatNumber(session.tokenTotal),
    }))
}

function formatSafeDate(value: string) {
    if (!value) {
        return '-'
    }

    const date = new Date(value)

    if (!Number.isFinite(date.getTime())) {
        return '-'
    }

    return formatDate(date)
}

function countSessionsByDate(sessions: ProjectSessionListItem[], dateLabel: string) {
    return sessions.filter(session => getSessionDateLabel(session.startedAt) === dateLabel).length
}

function buildSessionCountByDate(sessions: ProjectSessionListItem[]) {
    return sessions.reduce((counts, session) => {
        const dateLabel = getSessionDateLabel(session.startedAt)

        if (!dateLabel) {
            return counts
        }

        counts.set(dateLabel, (counts.get(dateLabel) ?? 0) + 1)

        return counts
    }, new Map<string, number>())
}

function getSessionDateLabel(value: string) {
    if (!value) {
        return ''
    }

    const date = new Date(value)

    if (!Number.isFinite(date.getTime())) {
        return ''
    }

    return formatDateLabelFromDateKey(getDateKey(date))
}

function summarizeUsage(sessions: ProjectSessionListItem[]) {
    return sessions.reduce((summary, session) => ({
        cachedInputTokens: summary.cachedInputTokens + session.cachedInputTokens,
        costUSD: summary.costUSD + session.costUSD,
        inputTokens: summary.inputTokens + session.inputTokens,
        outputTokens: summary.outputTokens + session.outputTokens,
        reasoningOutputTokens: summary.reasoningOutputTokens + session.reasoningOutputTokens,
        sessions: summary.sessions + 1,
        totalTokens: summary.totalTokens + session.tokenTotal,
    }), {
        cachedInputTokens: 0,
        costUSD: 0,
        inputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        sessions: 0,
        totalTokens: 0,
    })
}

function summarizeSessions(sessions: ProjectSessionListItem[]) {
    return sessions.reduce((summary, session) => ({
        costUSD: summary.costUSD + session.costUSD,
        sessions: summary.sessions + 1,
        totalTokens: summary.totalTokens + session.tokenTotal,
    }), {
        costUSD: 0,
        sessions: 0,
        totalTokens: 0,
    })
}

function uniqueItems<T>(items: T[]) {
    return Array.from(new Set(items))
}
</script>
