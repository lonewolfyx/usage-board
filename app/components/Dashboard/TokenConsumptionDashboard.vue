<template>
    <DashboardPage>
        <DashboardOverviewCards :cards="overviewCards" />

        <DashboardPanelGrid>
            <StatisticalAnalysisModelUsagePanel :monthly-items="monthlyModelUsage" class="md:col-span-8" />
            <StatisticalAnalysisProjectUsagePanel :items="projectUsage" class="md:col-span-4" />
            <UsageHeatmapPanel
                :items="dailyTokenUsage"
                class="md:col-span-12"
                :title="`${productName} Token Heatmap`"
            />
            <UsageAnalyticsTokenUsageTabsPanel
                :daily-items="sessionDailyRows"
                :monthly-items="monthlyRows"
                :product-name="productName"
                :session-items="sessionRows"
                :weekly-items="weeklyRows"
                class="md:col-span-12"
            />
            <UsageAnalyticsSessionUsageTable
                :items="sessionUsage"
                :product-name="productName"
                class="md:col-span-12"
            />
        </DashboardPanelGrid>
    </DashboardPage>
</template>

<script setup lang="ts">
import { buildSessionDailyRows } from '#shared/utils/usage-dashboard'

defineOptions({
    name: 'DashboardTokenConsumptionDashboard',
})

const props = defineProps<{
    dailyRows: UsageAnalyticsTokenUsageRow[]
    dailyTokenUsage: DailyTokenUsage[]
    monthlyModelUsage: MonthlyModelUsage[]
    monthlyRows: UsageAnalyticsTokenUsageRow[]
    overviewCards: DashboardOverviewCard[]
    productName: string
    projectUsage: ProjectUsageItem[]
    sessionRows: UsageAnalyticsTokenUsageRow[]
    sessionUsage: UsageAnalyticsSessionUsageItem[]
    weeklyRows: UsageAnalyticsTokenUsageRow[]
}>()

const sessionDailyRows = computed<UsageAnalyticsTokenUsageRow[]>(() => buildSessionDailyRows(props.sessionUsage))
</script>
