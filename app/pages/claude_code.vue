<template>
    <div class="grow container mx-auto space-y-8">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatisticalAnalysisTotalCard
                v-for="card in overviewCards"
                :key="card.name"
                :icon="card.icon"
                :name="card.name"
                :trend="card.trend"
                :trend-tone="card.trendTone"
                :value="card.value"
            />
        </div>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-12">
            <StatisticalAnalysisModelUsagePanel :monthly-items="monthlyModelUsage" class="md:col-span-8" />
            <StatisticalAnalysisProjectUsagePanel :items="projectUsage" class="md:col-span-4" />
            <CodexTokenHeatmapPanel :items="dailyTokenUsage" :product-name="productName" class="md:col-span-12" />
            <CodexTokenUsageTabsPanel
                :daily-items="dailyRows"
                :monthly-items="monthlyRows"
                :product-name="productName"
                :session-items="sessionRows"
                :weekly-items="weeklyRows"
                class="md:col-span-12"
            />
            <CodexSessionUsageTable :items="sessionUsage" :product-name="productName" class="md:col-span-12" />
        </div>
    </div>
</template>

<script setup lang="ts">
import CodexSessionUsageTable from '~/components/Codex/SessionUsageTable.vue'
import CodexTokenHeatmapPanel from '~/components/Codex/TokenHeatmapPanel.vue'
import CodexTokenUsageTabsPanel from '~/components/Codex/TokenUsageTabsPanel.vue'
import { useClaudeCodeDashboard } from '~/composables/useClaudeCodeDashboard'

const productName = 'Claude Code'

const {
    dailyRows,
    dailyTokenUsage,
    monthlyModelUsage,
    monthlyRows,
    overviewCards,
    projectUsage,
    sessionRows,
    sessionUsage,
    weeklyRows,
} = useClaudeCodeDashboard()
</script>
