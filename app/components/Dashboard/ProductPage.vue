<template>
    <DashboardTokenConsumptionDashboard
        :daily-rows="dailyRows"
        :daily-token-usage="dailyTokenUsage"
        :monthly-model-usage="monthlyModelUsage"
        :monthly-rows="monthlyRows"
        :overview-cards="overviewCards"
        :product-name="productName"
        :project-usage="projectUsage"
        :session-rows="sessionRows"
        :session-usage="sessionUsage"
        :weekly-rows="weeklyRows"
    />
</template>

<script setup lang="ts">
import type { ProjectUsagePlatform } from '#shared/types/ai'

defineOptions({
    name: 'DashboardProductPage',
})

const props = defineProps<{
    productKey: ProjectUsagePlatform
    productName: string
}>()

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
} = usePayloadDashboard(props.productKey)
</script>
