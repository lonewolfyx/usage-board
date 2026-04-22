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
                        <Select v-model="selectedProjectId">
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
                                // 'data-[state=active]:shadow-none',
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
                                        <!--                                        <Badge variant="secondary"> -->
                                        <!--                                            {{ tabSummaries[tab.value].sessions }} -->
                                        <!--                                        </Badge> -->
                                    </div>
                                    <span class="block truncate text-xs text-muted-foreground tabular-nums">
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
                            <p class="truncate text-sm font-semibold tabular-nums">
                                {{ item.value }}
                            </p>
                            <p class="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                {{ item.label }}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <DashboardPage>
            <TabsContent class="m-0" value="all">
                <DashboardPanelGrid>
                    <DashboardOverviewCards :cards="allOverviewCards" class="md:col-span-12 lg:grid-cols-5" />

                    <StatisticalAnalysisPanel
                        class="md:col-span-12"
                        description="Recent 30 days by provider"
                        icon="lucide:activity"
                        title="Daily Token Trend"
                    >
                        <DashboardProjectLineChart
                            :series="dailySeries"
                            :tooltip-labels="dailyTooltipLabels"
                            :x-labels="dailyTrendLabels"
                        />
                    </StatisticalAnalysisPanel>

                    <StatisticalAnalysisPanel
                        class="md:col-span-12"
                        description="Recent 30 days by model"
                        icon="solar:cpu-line-duotone"
                        title="Model Usage"
                    >
                        <DashboardProjectLineChart
                            :series="allModelSeries"
                            :tooltip-labels="dailyTooltipLabels"
                            :x-labels="dailyTrendLabels"
                        />
                    </StatisticalAnalysisPanel>

                    <StatisticalAnalysisPanel
                        class="md:col-span-12"
                        description="All mock sessions in this project"
                        icon="lucide:messages-square"
                        title="Session Statistics"
                    >
                        <DashboardProjectSessionTable :items="allSessionRows" />
                    </StatisticalAnalysisPanel>

                    <StatisticalAnalysisPanel
                        class="md:col-span-12"
                        description="Daily model activity by token type, cache reads, total usage, and cost"
                        icon="lucide:calendar-days"
                        title="Daily Token Usage"
                    >
                        <DashboardProjectTokenUsageTable :items="allDailyRows" />
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
                        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
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
                    </div>

                    <StatisticalAnalysisPanel
                        :description="`${tab.label} token usage within the current project this year`"
                        class="md:col-span-12"
                        icon="lucide:chart-area"
                        title="Yearly Token Trend"
                    >
                        <DashboardProjectLineChart
                            :series="platformViews[tab.value].yearSeries"
                            :tick-indexes="yearDayTickIndexes"
                            :tooltip-labels="yearDayTooltipLabels"
                            :x-labels="yearDayLabels"
                        />
                    </StatisticalAnalysisPanel>

                    <StatisticalAnalysisPanel
                        :description="`${tab.label} model trend within the current project this year`"
                        class="md:col-span-12"
                        icon="solar:cpu-line-duotone"
                        title="Model Usage Trend"
                    >
                        <DashboardProjectLineChart
                            :series="platformViews[tab.value].modelSeries"
                            :tick-indexes="yearDayTickIndexes"
                            :tooltip-labels="yearDayTooltipLabels"
                            :x-labels="yearDayLabels"
                        />
                    </StatisticalAnalysisPanel>

                    <StatisticalAnalysisPanel
                        class="md:col-span-12"
                        description="Browse token usage by today, week, month, or session"
                        icon="lucide:table-2"
                        title="Token Usage"
                    >
                        <Tabs v-model="activeTableTab">
                            <TabsList class="grid w-full grid-cols-4 sm:w-fit">
                                <TabsTrigger value="today">
                                    Today
                                </TabsTrigger>
                                <TabsTrigger value="week">
                                    Period
                                </TabsTrigger>
                                <TabsTrigger value="month">
                                    Month
                                </TabsTrigger>
                                <TabsTrigger value="session">
                                    Session
                                </TabsTrigger>
                            </TabsList>
                            <TabsContent class="mt-4" value="today">
                                <DashboardProjectTokenUsageTable :items="platformViews[tab.value].todayRows" />
                            </TabsContent>
                            <TabsContent class="mt-4" value="week">
                                <DashboardProjectTokenUsageTable :items="platformViews[tab.value].weekRows" />
                            </TabsContent>
                            <TabsContent class="mt-4" value="month">
                                <DashboardProjectTokenUsageTable :items="platformViews[tab.value].monthRows" />
                            </TabsContent>
                            <TabsContent class="mt-4" value="session">
                                <DashboardProjectTokenUsageTable :items="platformViews[tab.value].sessionRows" />
                            </TabsContent>
                        </Tabs>
                    </StatisticalAnalysisPanel>

                    <StatisticalAnalysisPanel
                        :description="`${tab.label} sessions in the current project`"
                        class="md:col-span-12"
                        icon="lucide:list-tree"
                        title="Session List"
                    >
                        <DashboardProjectSessionTable :items="platformViews[tab.value].sessionTableRows" />
                    </StatisticalAnalysisPanel>
                </DashboardPanelGrid>
            </TabsContent>
        </DashboardPage>
    </tabs>
</template>

<script lang="ts" setup>
import type {
    LineSeries,
    MockProject,
    MockSession,
    OverviewCard,
    PlatformKey,
    PlatformView,
    ProductPlatformKey,
    ProjectDashboardPlatformTab,
    ProjectDashboardTab,
    TableTab,
    TabSummary,
    UsageSummary,
} from '#shared/typed/project-dashboard'
import {
    buildProjectDailyModelSeries,
    buildProjectDailyRows,
    buildProjectMonthRows,
    buildProjectWeekRows,
    summarizeSessions,
    toSessionRows,
    toTokenUsageRow,
} from '#shared/utils/project-dashboard'
import {
    buildPercentTrend,
    formatCompactNumber,
    formatCurrency,
    formatDate,
    formatPercent,
    isSameDay,
} from '#shared/utils/usage-dashboard'
import { cn } from '~/lib/utils'

const selectedProjectId = shallowRef('usage-board')
const activeTab = shallowRef<PlatformKey>('all')
const activeTableTab = shallowRef<TableTab>('today')

const projects: MockProject[] = [
    {
        id: 'usage-board',
        name: 'Usage Board',
        owner: 'lonewolfyx',
        repository: 'github.com/lonewolfyx/usage-board',
        since: '2026-03-18T08:00:00.000Z',
        status: 'Active',
    },
    {
        id: 'design-lab',
        name: 'Design Lab',
        owner: 'studio',
        repository: 'github.com/studio/design-lab',
        since: '2026-02-04T08:00:00.000Z',
        status: 'Review',
    },
    {
        id: 'agent-console',
        name: 'Agent Console',
        owner: 'platform',
        repository: 'github.com/platform/agent-console',
        since: '2026-01-12T08:00:00.000Z',
        status: 'Active',
    },
]

const tabs: ProjectDashboardTab[] = [
    { label: 'All', value: 'all' },
    { aiIcon: 'claude_code', color: '#d97757', label: 'Claude Code', value: 'claudeCode' },
    { aiIcon: 'codex', color: '#111827', label: 'Codex', value: 'codex' },
    { aiIcon: 'gemini', color: '#0ea5e9', label: 'Gemini', value: 'gemini' },
]

const platformTabs = tabs.filter((tab): tab is ProjectDashboardPlatformTab => tab.value !== 'all')

const sessions: MockSession[] = buildMockSessions()
const fallbackProject = projects[0]!
const selectedProject = computed<MockProject>(() => projects.find(project => project.id === selectedProjectId.value) ?? fallbackProject)
const projectSessions = computed(() => sessions.filter(session => session.projectId === selectedProject.value.id))
const tabSummaries = computed<Record<PlatformKey, TabSummary>>(() => Object.fromEntries(tabs.map((tab) => {
    const tabSessions = tab.value === 'all'
        ? projectSessions.value
        : projectSessions.value.filter(session => session.platform === tab.value)
    const summary = summarizeSessions(tabSessions)

    return [tab.value, {
        cost: formatCurrency(summary.cost),
        label: tab.label,
        sessions: String(summary.sessions),
        tokens: formatCompactNumber(summary.tokens),
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
const allSummary = computed(() => summarizeSessions(projectSessions.value))
const allDailyRowsRaw = computed(() => buildProjectDailyRows(projectSessions.value))
const allDailyRows = computed(() => allDailyRowsRaw.value.map(row => toTokenUsageRow(row.label, row.items)))
const allSessionRows = computed(() => toSessionRows(projectSessions.value))
const allModelSeries = computed(() => buildProjectDailyModelSeries(projectSessions.value, allDailyRowsRaw.value))
const dailyTrendLabels = computed(() => allDailyRowsRaw.value.map(row => row.shortLabel))
const dailyTooltipLabels = computed(() => allDailyRowsRaw.value.map(row => row.label))
const dailySeries = computed<LineSeries[]>(() => platformTabs.map(tab => ({
    color: tab.color,
    label: tab.label,
    points: allDailyRowsRaw.value.map(row => summarizeSessions(row.items.filter(session => session.platform === tab.value)).tokens),
})))
const yearDays = Array.from({ length: 365 }, (_, index) => new Date(Date.UTC(2025, 3, 23 + index)))
const yearDayLabels = yearDays.map((date, index) => {
    if (index === 0 || date.getUTCDate() === 1) {
        return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            timeZone: 'UTC',
        }).format(date)
    }

    return ''
})
const yearDayTickIndexes = yearDays
    .map((date, index) => ({ date, index }))
    .filter(({ date, index }) => index === 0 || date.getUTCDate() === 1 || index === yearDays.length - 1)
    .map(({ index }) => index)
const yearDayTooltipLabels = yearDays.map(date => formatDate(date.toISOString()))

const allOverviewCards = computed<OverviewCard[]>(() => [
    {
        icon: 'solar:cpu-line-duotone',
        name: 'Total Tokens',
        trend: 'project total',
        trendTone: 'neutral',
        value: formatCompactNumber(allSummary.value.tokens),
    },
    {
        icon: 'lucide:wallet',
        name: 'Total Spend',
        trend: 'mock billing',
        trendTone: 'neutral',
        value: formatCurrency(allSummary.value.cost),
    },
    {
        icon: 'lucide:messages-square',
        name: 'Sessions',
        trend: 'all tools',
        trendTone: 'neutral',
        value: String(allSummary.value.sessions),
    },
    {
        icon: 'lucide:database-zap',
        name: 'Cache Hit Rate',
        trend: `${formatCompactNumber(allSummary.value.cacheTokens)} cached`,
        trendTone: 'neutral',
        value: formatPercent(allSummary.value.cacheRate),
    },
    {
        icon: 'lucide:circle-dollar-sign',
        name: 'Avg Session Cost',
        trend: 'per session',
        trendTone: 'neutral',
        value: formatCurrency(allSummary.value.sessions > 0 ? allSummary.value.cost / allSummary.value.sessions : 0),
    },
])

const platformViews = computed(() => Object.fromEntries(platformTabs.map((tab) => {
    const platformSessions = projectSessions.value.filter(session => session.platform === tab.value)
    const summary = summarizeSessions(platformSessions)
    const todaySessions = platformSessions.filter(session => isSameDay(session.startedAt, '2026-04-22'))
    const yesterdaySessions = platformSessions.filter(session => isSameDay(session.startedAt, '2026-04-21'))
    const todaySummary = summarizeSessions(todaySessions)
    const yesterdaySummary = summarizeSessions(yesterdaySessions)

    return [tab.value, {
        modelSeries: buildModelYearSeries(tab.value, selectedProject.value.id),
        monthRows: buildProjectMonthRows(platformSessions).map(row => toTokenUsageRow(row.label, row.items)),
        overviewCards: buildPlatformOverviewCards(summary, todaySummary, yesterdaySummary),
        sessionRows: platformSessions.map(session => toTokenUsageRow(session.title, [session])),
        sessionTableRows: toSessionRows(platformSessions),
        todayRows: [toTokenUsageRow('Today', todaySessions)],
        weekRows: buildProjectWeekRows(platformSessions).map(row => toTokenUsageRow(row.label, row.items)),
        yearSeries: [{
            color: tab.color,
            label: tab.label,
            points: buildYearPoints(tab.value, selectedProject.value.id),
        }],
    }]
})) as Record<ProductPlatformKey, PlatformView>)

function buildPlatformOverviewCards(
    summary: UsageSummary,
    today: UsageSummary,
    yesterday: UsageSummary,
): OverviewCard[] {
    const tokenTrend = buildPercentTrend(today.tokens, yesterday.tokens)
    const costTrend = buildPercentTrend(today.cost, yesterday.cost)
    const sessionTrend = buildPercentTrend(today.sessions, yesterday.sessions)

    return [
        {
            icon: 'solar:cpu-line-duotone',
            name: 'Today Tokens',
            trend: tokenTrend.label,
            trendTone: tokenTrend.tone,
            value: formatCompactNumber(today.tokens),
        },
        {
            icon: 'lucide:wallet',
            name: 'Today Spend',
            trend: costTrend.label,
            trendTone: costTrend.tone,
            value: formatCurrency(today.cost),
        },
        {
            icon: 'lucide:messages-square',
            name: 'Today Sessions',
            trend: sessionTrend.label,
            trendTone: sessionTrend.tone,
            value: String(today.sessions),
        },
        {
            icon: 'lucide:receipt-text',
            name: 'Total Spend',
            trend: 'all time',
            trendTone: 'neutral',
            value: formatCurrency(summary.cost),
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
            trend: `${formatCompactNumber(summary.cacheTokens)} cached`,
            trendTone: 'neutral',
            value: formatPercent(summary.cacheRate),
        },
        {
            icon: 'lucide:circle-dollar-sign',
            name: 'Avg Session Cost',
            trend: 'per session',
            trendTone: 'neutral',
            value: formatCurrency(summary.sessions > 0 ? summary.cost / summary.sessions : 0),
        },
    ]
}

function buildYearPoints(platform: ProductPlatformKey, projectId: string) {
    const seed = platform === 'claudeCode' ? 81000 : platform === 'codex' ? 64000 : 42000
    const projectBoost = projectId === 'agent-console' ? 1.24 : projectId === 'design-lab' ? 0.78 : 1

    return yearDays.map((_, index) => {
        const weeklyWave = Math.sin((index / 7) * Math.PI * 2) * 0.12
        const monthlyWave = Math.cos((index / 31) * Math.PI * 2) * 0.18
        const growth = 1 + (index / yearDays.length) * 0.42
        const pulse = index % 29 === 0 ? 0.34 : 0

        return Math.round(seed * projectBoost * growth * (1 + weeklyWave + monthlyWave + pulse))
    })
}

function buildModelYearSeries(platform: ProductPlatformKey, projectId: string): LineSeries[] {
    const models = {
        claudeCode: ['claude-sonnet-4.5', 'claude-opus-4.1'],
        codex: ['gpt-5.4-codex', 'gpt-5.2-codex'],
        gemini: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    } satisfies Record<ProductPlatformKey, string[]>
    const colors = ['#2563eb', '#f97316', '#0891b2']
    const basePoints = buildYearPoints(platform, projectId)

    return models[platform].map((model, index) => ({
        color: colors[index] ?? '#2563eb',
        label: model,
        points: basePoints.map((point, monthIndex) => Math.round(point * (index === 0 ? 0.62 : 0.38) * (1 + ((monthIndex % 2) * 0.08)))),
    }))
}

function buildMockSessions(): MockSession[] {
    const projectIds = ['usage-board', 'design-lab', 'agent-console']
    const platforms: ProductPlatformKey[] = ['claudeCode', 'codex', 'gemini']
    const models = {
        claudeCode: ['claude-sonnet-4.5', 'claude-opus-4.1'],
        codex: ['gpt-5.4-codex', 'gpt-5.2-codex'],
        gemini: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    } satisfies Record<ProductPlatformKey, string[]>

    return projectIds.flatMap((projectId, projectIndex) => Array.from({ length: 30 }, (_, dayIndex) => {
        const day = 22 - dayIndex
        const date = new Date(Date.UTC(2026, 3, day, 8 + (dayIndex % 8), 20, 0))

        return platforms.map((platform, platformIndex): MockSession => {
            const tokens = 36000
                + ((30 - dayIndex) * 3200)
                + (projectIndex * 9000)
                + (platformIndex * 14500)
                + ((dayIndex % 5) * 11800)
                + (platform === 'claudeCode' ? 28000 : platform === 'codex' ? 17000 : 8000)
            const inputTokens = Math.round(tokens * 0.46)
            const outputTokens = Math.round(tokens * 0.28)
            const reasoningTokens = Math.round(tokens * 0.16)
            const cacheTokens = Math.round(tokens * (0.3 + (((dayIndex + platformIndex) % 5) * 0.055)))
            const titleIndex = (dayIndex + platformIndex) % 6

            return {
                cacheTokens,
                cost: Math.round((tokens / 38000) * (platform === 'gemini' ? 0.52 : platform === 'codex' ? 0.78 : 1.08) * 100) / 100,
                duration: `${18 + ((dayIndex + platformIndex) * 3) % 44}m`,
                id: `${projectId}-${platform}-${dayIndex}`,
                inputTokens,
                model: models[platform][(dayIndex + platformIndex) % 2]!,
                outputTokens,
                platform,
                projectId,
                reasoningTokens,
                startedAt: date.toISOString(),
                title: [
                    'Project dashboard refinement',
                    'Token analytics review',
                    'Session trace cleanup',
                    'Model usage comparison',
                    'Interaction detail mapping',
                    'Navigation polish',
                ][titleIndex]!,
                tokens,
            }
        })
    }).flat())
}
</script>
