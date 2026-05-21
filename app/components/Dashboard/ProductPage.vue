<template>
    <DashboardTokenConsumptionDashboard
        :daily-rows="dailyRows"
        :daily-token-usage="dailyTokenUsage"
        :error-message="errorText"
        :insights-error-message="insightsErrorText"
        :insights-loading="showInsightsSkeleton"
        :loading="showSkeleton"
        :monthly-model-usage="monthlyModelUsage"
        :monthly-rows="monthlyRows"
        :overview-cards="overviewCards"
        :product-name="productName"
        :project-usage="projectUsage"
        :session-error-message="sessionErrorText"
        :session-loading="showSessionSkeleton"
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
    error,
    insightsError,
    insightsStatus,
    monthlyModelUsage,
    monthlyRows,
    overviewCards,
    projectUsage,
    sessionError,
    sessionRows,
    sessionStatus,
    sessionUsage,
    status,
    weeklyRows,
} = useAgentDashboard(toRef(props, 'productKey'))

const {
    errorText,
    showSkeleton,
} = useDashboardAsyncState(status, error)

const {
    errorText: insightsErrorText,
    showSkeleton: showInsightsSkeleton,
} = useDashboardAsyncState(insightsStatus, insightsError)

const {
    errorText: sessionErrorText,
    showSkeleton: showSessionSkeleton,
} = useDashboardAsyncState(sessionStatus, sessionError)
</script>
