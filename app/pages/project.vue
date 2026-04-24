<template>
    <Tabs v-model="activeTab">
        <div class="relative flex flex-col border-b z-10 pb-5 mb-5">
            <div class="container mx-auto flex flex-col gap-3">
                <div class="relative flex justify-between items-stretch">
                    <div
                        :class="cn(
                            'flex items-center gap-4',
                            'before:content-[\' \'] before:absolute',
                            'before:w-1 before:h-full',
                            'before:rounded-full',
                            'before:bg-amber-500',
                        )"
                    >
                        <Select v-model="selectedProjectId" :disabled="isProjectSelectDisabled">
                            <SelectTrigger
                                aria-label="Select Project"
                                :class="cn(
                                    'bg-transparent dark:bg-transparent! border-0 px-0 py-0 font-semibold',
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
                        <div v-if="isProjectModuleLoading" class="flex items-center gap-2 text-xs text-muted-foreground">
                            <Spinner class="size-3.5" />
                            <span>Switching project...</span>
                        </div>
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
</script>
