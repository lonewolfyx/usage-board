<template>
    <DashboardPage>
        <p v-if="errorText" class="text-xs text-destructive">
            {{ errorText }}
        </p>

        <template v-if="showSkeleton">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Skeleton v-for="index in 4" :key="index" class="h-28 rounded-md" />
            </div>

            <DashboardPanelGrid>
                <StatisticalAnalysisPanel
                    class="md:col-span-8"
                    description="Monthly token trends by model"
                    icon="solar:cpu-line-duotone"
                    title="Model Usage"
                >
                    <Skeleton class="h-72 w-full rounded-md" />
                </StatisticalAnalysisPanel>
                <StatisticalAnalysisPanel
                    class="md:col-span-4"
                    description="Best performers by spend"
                    icon="lucide:folder-git-2"
                    title="Top Projects"
                >
                    <Skeleton class="h-72 w-full rounded-md" />
                </StatisticalAnalysisPanel>
                <StatisticalAnalysisPanel
                    class="md:col-span-12"
                    description="Usage trend over the selected period"
                    icon="lucide:activity"
                    title="Usage Trend"
                >
                    <Skeleton class="h-80 w-full rounded-md" />
                </StatisticalAnalysisPanel>
                <StatisticalAnalysisPanel
                    class="md:col-span-6"
                    description="Token, duration, and cost grouped by project"
                    icon="lucide:messages-square"
                    title="Session Analysis"
                >
                    <Skeleton class="h-72 w-full rounded-md" />
                </StatisticalAnalysisPanel>
                <StatisticalAnalysisPanel
                    class="md:col-span-6"
                    description="Cached input ratio across total input tokens"
                    icon="lucide:gauge"
                    title="Efficiency / Cache"
                >
                    <Skeleton class="h-72 w-full rounded-md" />
                </StatisticalAnalysisPanel>
                <StatisticalAnalysisPanel
                    class="md:col-span-12"
                    description="Daily model activity by token type, cache reads, total usage, and cost"
                    icon="lucide:calendar-days"
                    title="Daily Token Usage"
                >
                    <Skeleton class="h-72 w-full rounded-md" />
                </StatisticalAnalysisPanel>
            </DashboardPanelGrid>
        </template>

        <template v-else>
            <DashboardOverviewCards :cards="overviewCards" />

            <DashboardPanelGrid>
                <StatisticalAnalysisModelUsagePanel :monthly-items="monthlyModelUsage" class="md:col-span-8" />
                <StatisticalAnalysisProjectUsagePanel :items="projectUsage" class="md:col-span-4" />
                <StatisticalAnalysisPanel
                    v-if="showUsageSkeleton || usageErrorText"
                    class="md:col-span-12"
                    description="Usage trend over the selected period"
                    icon="lucide:activity"
                    title="Usage Trend"
                >
                    <p v-if="usageErrorText" class="text-xs text-destructive">
                        {{ usageErrorText }}
                    </p>
                    <Skeleton v-else class="h-80 w-full rounded-md" />
                </StatisticalAnalysisPanel>
                <UsageHeatmapPanel
                    v-else
                    :items="dailyTokenUsage"
                    class="md:col-span-12"
                    heat-metric="cost"
                    title="Usage Trend"
                />
                <StatisticalAnalysisSessionAnalysisPanel
                    :error-message="sessionErrorText"
                    :items="sessionUsage"
                    :loading="showSessionSkeleton"
                    :total-sessions="totalSessions"
                    class="md:col-span-6"
                />
                <StatisticalAnalysisPanel
                    v-if="showUsageSkeleton || usageErrorText"
                    class="md:col-span-6"
                    description="Cached input ratio across total input tokens"
                    icon="lucide:gauge"
                    title="Efficiency / Cache"
                >
                    <p v-if="usageErrorText" class="text-xs text-destructive">
                        {{ usageErrorText }}
                    </p>
                    <Skeleton v-else class="h-72 w-full rounded-md" />
                </StatisticalAnalysisPanel>
                <StatisticalAnalysisEfficiencyCachePanel
                    v-else
                    :daily-items="dailyTokenUsage"
                    :items="efficiencyMetrics"
                    class="md:col-span-6"
                />
                <StatisticalAnalysisPanel
                    v-if="showUsageSkeleton || usageErrorText"
                    class="md:col-span-12"
                    description="Daily model activity by token type, cache reads, total usage, and cost"
                    icon="lucide:calendar-days"
                    title="Daily Token Usage"
                >
                    <p v-if="usageErrorText" class="text-xs text-destructive">
                        {{ usageErrorText }}
                    </p>
                    <Skeleton v-else class="h-72 w-full rounded-md" />
                </StatisticalAnalysisPanel>
                <StatisticalAnalysisTokensUsagePanel v-else :items="dailyTokenUsage" class="md:col-span-12" />
            </DashboardPanelGrid>
        </template>
    </DashboardPage>
</template>

<script lang="ts" setup>
const {
    dailyTokenUsage,
    error,
    efficiencyMetrics,
    monthlyModelUsage,
    projectUsage,
    sessionAnalysisError,
    sessionAnalysisStatus,
    sessionUsage,
    totalSessions,
    status,
    usageError,
    usageStatus,
    overviewCards,
} = useHomeDashboard()

const {
    errorText,
    showSkeleton,
} = useDashboardAsyncState(status, error)

const {
    errorText: sessionErrorText,
    showSkeleton: showSessionSkeleton,
} = useDashboardAsyncState(sessionAnalysisStatus, sessionAnalysisError)

const {
    errorText: usageErrorText,
    showSkeleton: showUsageSkeleton,
} = useDashboardAsyncState(usageStatus, usageError)
</script>
