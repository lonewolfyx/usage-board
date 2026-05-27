<template>
    <div class="bg-background border border-input rounded-xl shadow-xs min-h-0 flex-1 overflow-y-auto">
        <div class="grid content-start p-4 space-y-3">
            <div
                :class="cn(
                    'relative flex items-center gap-2 mb-4 text-foreground font-medium',
                    'after:content-\[ \]',
                    'after:absolute after:w-px after:h-full after:rounded-2xl',
                    'after:border-l-2 after:border-amber-500/50 after:-ml-2 ml-2',
                )"
            >
                <span class="capitalize">agent:</span>
                <span>{{ productName }}</span>
            </div>

            <p v-if="errorMessage" class="text-xs text-destructive">
                {{ errorMessage }}
            </p>

            <template v-if="loading">
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
                        :description="`${productName} token usage across the heatmap range`"
                        icon="lucide:chart-area"
                        :title="`${productName} Token Heatmap`"
                    >
                        <Skeleton class="h-80 w-full rounded-md" />
                    </StatisticalAnalysisPanel>
                    <StatisticalAnalysisPanel
                        class="md:col-span-12"
                        :description="`Browse ${productName} token consumption by day, week, month, or session.`"
                        icon="lucide:table-2"
                        :title="`${productName} Token Usage`"
                    >
                        <Skeleton class="h-72 w-full rounded-md" />
                    </StatisticalAnalysisPanel>
                    <StatisticalAnalysisPanel
                        class="md:col-span-12"
                        :description="`Each row maps one ${productName} session to its session-level token consumption.`"
                        icon="lucide:file-json-2"
                        :title="`${productName} Session Statistics`"
                    >
                        <Skeleton class="h-72 w-full rounded-md" />
                    </StatisticalAnalysisPanel>
                </DashboardPanelGrid>
            </template>

            <template v-else>
                <DashboardOverviewCards :cards="overviewCards" />

                <DashboardPanelGrid>
                    <StatisticalAnalysisModelUsagePanel :monthly-items="monthlyModelUsage" class="md:col-span-8" />
                    <StatisticalAnalysisPanel
                        v-if="insightsLoading || insightsErrorMessage"
                        class="md:col-span-4"
                        description="Best performers by spend"
                        icon="lucide:folder-git-2"
                        title="Top Projects"
                    >
                        <p v-if="insightsErrorMessage" class="text-xs text-destructive">
                            {{ insightsErrorMessage }}
                        </p>
                        <Skeleton v-else class="h-72 w-full rounded-md" />
                    </StatisticalAnalysisPanel>
                    <StatisticalAnalysisProjectUsagePanel v-else :items="projectUsage" class="md:col-span-4" />
                    <UsageHeatmapPanel
                        :items="dailyTokenUsage"
                        class="md:col-span-12"
                        :title="`${productName} Token Heatmap`"
                    />
                    <UsageAnalyticsTokenUsageTabsPanel
                        :daily-items="dailyRows"
                        :daily-pagination="dailyRowsPagination"
                        :error-message="insightsErrorMessage"
                        :fetch-page="fetchTokenUsagePage"
                        :loading="insightsLoading"
                        :monthly-items="monthlyRows"
                        :monthly-pagination="monthlyRowsPagination"
                        :product-name="productName"
                        :session-items="sessionRows"
                        :session-pagination="sessionRowsPagination"
                        :weekly-items="weeklyRows"
                        :weekly-pagination="weeklyRowsPagination"
                        class="md:col-span-12"
                    />
                    <UsageAnalyticsSessionUsageTable
                        :error-message="sessionErrorMessage"
                        :fetch-page="fetchSessionUsagePage"
                        :items="sessionUsage"
                        :loading="sessionLoading"
                        :pagination="sessionUsagePagination"
                        :product-name="productName"
                        class="md:col-span-12"
                    />
                </DashboardPanelGrid>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { AnalysisAgentSessionRow } from '#shared/types/analysis'
import type { FetchPage, PaginationMeta } from '#shared/types/pagination'
import { cn } from '~/lib/utils'

defineOptions({
    name: 'DashboardTokenConsumptionDashboard',
})

defineProps<{
    dailyRows: UsageAnalyticsTokenUsageRow[]
    dailyRowsPagination: PaginationMeta
    dailyTokenUsage: DailyTokenUsage[]
    errorMessage?: string
    fetchSessionUsagePage?: FetchPage<AnalysisAgentSessionRow>
    fetchTokenUsagePage?: (tab: TokenTabValue, page: number) => ReturnType<FetchPage<UsageAnalyticsTokenUsageRow>>
    insightsErrorMessage?: string
    insightsLoading?: boolean
    loading?: boolean
    monthlyModelUsage: MonthlyModelUsage[]
    monthlyRows: UsageAnalyticsTokenUsageRow[]
    monthlyRowsPagination: PaginationMeta
    overviewCards: UsageOverviewCard[]
    productName: string
    projectUsage: ProjectUsageItem[]
    sessionErrorMessage?: string
    sessionLoading?: boolean
    sessionRows: UsageAnalyticsTokenUsageRow[]
    sessionRowsPagination: PaginationMeta
    sessionUsage: AnalysisAgentSessionRow[]
    sessionUsagePagination: PaginationMeta
    weeklyRows: UsageAnalyticsTokenUsageRow[]
    weeklyRowsPagination: PaginationMeta
}>()
</script>
