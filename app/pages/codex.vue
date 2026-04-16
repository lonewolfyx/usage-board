<template>
    <DashboardTokenConsumptionDashboard
        :daily-rows="dailyRows"
        :daily-token-usage="dailyTokenUsage"
        :monthly-model-usage="monthlyModelUsage"
        :monthly-rows="monthlyRows"
        :overview-cards="overviewCards"
        product-name="Codex"
        :project-usage="projectUsage"
        :session-rows="sessionRows"
        :session-usage="sessionUsage"
        :weekly-rows="weeklyRows"
    />
</template>

<script setup lang="ts">
import { useCodexDashboard } from '~/composables/useCodexDashboard'

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
} = useCodexDashboard()
</script>
