<template>
    <Tabs v-model="activeTab" class="flex min-h-0 w-full flex-col gap-4 xl:flex-row">
        <div
            class="bg-background border border-input rounded-xl shadow-xs flex w-full shrink-0 flex-col overflow-hidden xl:w-xs"
        >
            <div class="flex items-center justify-between px-2 py-3 gap-1">
                <InputGroup>
                    <InputGroupInput
                        v-model="projectSearch"
                        placeholder="Search projects..."
                    />
                    <InputGroupAddon>
                        <Icon name="lucide:search" />
                    </InputGroupAddon>
                </InputGroup>
            </div>

            <div class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3">
                <div class="grid gap-1">
                    <Button
                        v-for="project in filteredProjects"
                        :key="project.id"
                        :aria-pressed="project.id === selectedProjectId"
                        :class="cn(
                            project.id === selectedProjectId
                                ? 'bg-secondary text-foreground hover:bg-secondary'
                                : 'hover:bg-secondary/70',
                        )"
                        :disabled="isProjectSelectDisabled"
                        :title="project.name"
                        class="h-auto min-w-0 w-full justify-start overflow-hidden rounded-lg p-2 text-left"
                        type="button"
                        variant="ghost"
                        @click="handleProjectSelect(project.id)"
                    >
                        <div class="flex min-w-0 w-full items-center gap-3 overflow-hidden">
                            <div
                                class="shrink-0 flex items-center justify-center border rounded-full size-[34px] bg-background"
                            >
                                <Avatar>
                                    <AvatarFallback>{{ getProjectInitials(project.name) }}</AvatarFallback>
                                </Avatar>
                            </div>
                            <div class="min-w-0 flex-1 overflow-hidden space-y-1">
                                <p class="max-w-full truncate text-sm font-medium">
                                    {{ project.name }}
                                </p>
                                <p class="max-w-full truncate text-xs text-muted-foreground">
                                    {{ project.platforms.length > 0 ? project.platforms.map(platform => PROJECT_USAGE_PLATFORM_META[platform].label).join(' / ') : 'No platforms detected' }}
                                </p>
                            </div>

                            <p
                                class="shrink-0 text-right text-xs font-semibold text-muted-foreground tabular-nums"
                            >
                                {{ formatCompactNumber(project.totalTokens) }}
                            </p>
                        </div>
                    </Button>

                    <div
                        v-if="projects.length === 0"
                        class="flex min-h-32 items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground"
                    >
                        No projects available yet.
                    </div>
                    <div
                        v-else-if="filteredProjects.length === 0"
                        class="flex min-h-32 items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground"
                    >
                        No matching projects found.
                    </div>
                </div>
            </div>
        </div>

        <div class="bg-background border border-input rounded-xl shadow-xs min-h-0 flex-1 overflow-y-auto">
            <div
                v-if="selectedProject"
                class="flex min-h-full flex-col"
            >
                <div class="border-b p-4 lg:p-5">
                    <div class="flex flex-col gap-5">
                        <div
                            v-if="isProjectModuleLoading"
                            class="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between"
                        >
                            <div
                                :class="cn(
                                    'relative flex flex-col gap-3 pl-4',
                                    'before:absolute before:left-0 before:top-0',
                                    'before:h-full before:w-1 before:rounded-full',
                                    'before:bg-amber-500',
                                )"
                            >
                                <div class="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Spinner class="size-3.5" />
                                    <span>Switching project...</span>
                                </div>
                            </div>
                        </div>

                        <div class="flex justify-between items-center">
                            <TabsList
                                aria-label="Project platform scope"
                                class="flex h-auto flex-wrap justify-start gap-3 bg-transparent p-0"
                            >
                                <TabsTrigger
                                    v-for="tab in tabs"
                                    :key="tab.value"
                                    :aria-label="tab.label"
                                    :class="cn(
                                        'data-[state=active]:border',
                                        'data-[state=active]:border-dashed',
                                        'data-[state=active]:border-amber-500',
                                        'data-[state=active]:bg-transparent',
                                    )"
                                    :value="tab.value"
                                    class="flex h-auto justify-start gap-3 shadow-none"
                                >
                                    <Icon
                                        v-if="tab.value === 'all'"
                                        aria-hidden="true"
                                        class="size-4 text-muted-foreground"
                                        mode="svg"
                                        name="lucide:layout-dashboard"
                                    />
                                    <Icon
                                        v-else
                                        :name="tab.aiIcon!"
                                        aria-hidden="true"
                                        class="size-5 text-muted-foreground"
                                    />

                                    <div class="min-w-0 flex-1">
                                        <div class="flex flex-col items-start gap-1.5">
                                            <div class="w-full flex justify-between items-center">
                                                <span class="truncate text-sm font-medium">{{ tab.label }}</span>
                                            </div>
                                            <Skeleton v-if="!isScopeReady" class="h-3 w-20" />
                                            <span
                                                v-else
                                                class="block truncate text-xs text-muted-foreground tabular-nums"
                                            >
                                                {{ tabSummaries[tab.value].tokens }} tokens
                                            </span>
                                        </div>
                                    </div>
                                </TabsTrigger>
                            </TabsList>

                            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <div
                                    v-for="item in activeScopeItems"
                                    :key="item.label"
                                    class="flex min-w-28 flex-col items-start gap-3 rounded-md border border-dotted px-3 py-2"
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

                <div class="p-4 lg:p-5">
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
                                <DashboardProjectSessionTable
                                    v-if="isModuleLoaded('session_list')"
                                    :items="allSessionRows"
                                />
                                <Skeleton v-else class="h-72 w-full rounded-md" />
                            </StatisticalAnalysisPanel>

                            <StatisticalAnalysisPanel
                                class="md:col-span-12"
                                description="Daily model activity by token type, cache reads, total usage, and cost"
                                icon="lucide:calendar-days"
                                title="Daily Token Usage"
                            >
                                <DashboardProjectTokenUsageTable
                                    v-if="isModuleLoaded('daily_trend')"
                                    :items="allDailyUsageRows"
                                />
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
                                <div
                                    v-if="isModuleLoaded('daily_trend') && isModuleLoaded('session_list')"
                                    class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"
                                >
                                    <StatisticalAnalysisTotalCard
                                        v-for="card in platformViews[tab.value].overviewCards"
                                        :key="card.name"
                                        :detail="card.detail"
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
                                :daily-items="platformViews[tab.value].dayRows"
                                :monthly-items="platformViews[tab.value].monthRows"
                                :product-name="tab.label"
                                :session-items="platformViews[tab.value].sessionRows"
                                :weekly-items="platformViews[tab.value].weekRows"
                                class="md:col-span-12"
                            />
                            <Skeleton v-else class="h-72 rounded-md md:col-span-12" />

                            <StatisticalAnalysisPanel
                                :description="`${tab.label} sessions in the current project`"
                                class="md:col-span-12"
                                icon="lucide:list-tree"
                                title="Session List"
                            >
                                <DashboardProjectSessionTable
                                    v-if="isModuleLoaded('session_list')"
                                    :items="platformViews[tab.value].sessionTableRows"
                                />
                                <Skeleton v-else class="h-72 w-full rounded-md" />
                            </StatisticalAnalysisPanel>
                        </DashboardPanelGrid>
                    </TabsContent>
                </div>
            </div>

            <div
                v-else
                class="flex min-h-[420px] items-center justify-center p-6"
            >
                <div class="w-full max-w-md rounded-xl border border-dashed px-6 py-10 text-center">
                    <p class="text-base font-medium text-foreground">
                        No project selected
                    </p>
                    <p class="mt-2 text-sm text-muted-foreground">
                        Select a project from the left panel to view its dashboard.
                    </p>
                </div>
            </div>
        </div>
    </Tabs>
</template>

<script lang="ts" setup>
import { PROJECT_USAGE_PLATFORM_META } from '#shared/platform/metadata'
import { formatCompactNumber } from '#shared/utils/usage-dashboard'
import { cn } from '~/lib/utils'

const {
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
} = useProjectDashboard()

const selectedProject = computed(() =>
    projects.value.find(project => project.id === selectedProjectId.value) ?? null,
)
const projectSearch = shallowRef('')
const filteredProjects = computed(() => {
    const keyword = projectSearch.value.trim().toLowerCase()
    const visibleProjects = keyword
        ? projects.value.filter(project => project.name.toLowerCase().includes(keyword))
        : projects.value

    return [...visibleProjects].sort((left, right) => right.totalTokens - left.totalTokens)
})

function handleProjectSelect(projectId: string) {
    if (isProjectSelectDisabled.value || projectId === selectedProjectId.value) {
        return
    }

    selectedProjectId.value = projectId
}

function getProjectInitials(name: string) {
    return name
        .split(/[\s/-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(segment => segment[0]?.toUpperCase() ?? '')
        .join('')
}
</script>
