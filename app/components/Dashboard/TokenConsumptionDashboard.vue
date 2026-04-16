<template>
    <DashboardPage>
        <DashboardOverviewCards :cards="overviewCards" />

        <DashboardPanelGrid>
            <StatisticalAnalysisModelUsagePanel :monthly-items="monthlyModelUsage" class="md:col-span-8" />
            <StatisticalAnalysisProjectUsagePanel :items="projectUsage" class="md:col-span-4" />
            <CodexTokenHeatmapPanel
                :items="dailyTokenUsage"
                :product-name="productName"
                class="md:col-span-12"
            />
            <CodexTokenUsageTabsPanel
                :daily-items="dailyRows"
                :monthly-items="monthlyRows"
                :product-name="productName"
                :session-items="sessionRows"
                :weekly-items="weeklyRows"
                class="md:col-span-12"
            />
            <CodexSessionUsageTable
                :items="sessionUsage"
                :product-name="productName"
                class="md:col-span-12"
            />
        </DashboardPanelGrid>
    </DashboardPage>
</template>

<script setup lang="ts">
import CodexSessionUsageTable from '~/components/Codex/SessionUsageTable.vue'
import CodexTokenHeatmapPanel from '~/components/Codex/TokenHeatmapPanel.vue'
import CodexTokenUsageTabsPanel from '~/components/Codex/TokenUsageTabsPanel.vue'

defineOptions({
    name: 'DashboardTokenConsumptionDashboard',
})

defineProps<{
    dailyRows: CodexTokenUsageRow[]
    dailyTokenUsage: DailyTokenUsage[]
    monthlyModelUsage: MonthlyModelUsage[]
    monthlyRows: CodexTokenUsageRow[]
    overviewCards: DashboardOverviewCard[]
    productName: string
    projectUsage: ProjectUsageItem[]
    sessionRows: CodexTokenUsageRow[]
    sessionUsage: CodexSessionUsageItem[]
    weeklyRows: CodexTokenUsageRow[]
}>()
</script>
