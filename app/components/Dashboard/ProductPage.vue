<template>
    <DashboardTokenConsumptionDashboard
        :daily-rows="dailyRows"
        :daily-rows-pagination="dailyRowsPagination"
        :daily-token-usage="dailyTokenUsage"
        :error-message="errorText"
        :fetch-session-usage-page="fetchSessionUsagePage"
        :fetch-token-usage-page="fetchTokenUsagePage"
        :insights-error-message="insightsErrorText"
        :insights-loading="showInsightsSkeleton"
        :loading="showSkeleton"
        :monthly-model-usage="monthlyModelUsage"
        :monthly-rows="monthlyRows"
        :monthly-rows-pagination="monthlyRowsPagination"
        :overview-cards="overviewCards"
        :product-name="productName"
        :project-usage="projectUsage"
        :session-error-message="sessionErrorText"
        :session-loading="showSessionSkeleton"
        :session-rows="sessionRows"
        :session-rows-pagination="sessionRowsPagination"
        :session-usage="sessionUsage"
        :session-usage-pagination="sessionUsagePagination"
        :weekly-rows="weeklyRows"
        :weekly-rows-pagination="weeklyRowsPagination"
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
    dailyRowsPagination,
    dailyTokenUsage,
    error,
    fetchSessionUsagePage,
    fetchTokenUsagePage,
    insightsError,
    insightsStatus,
    monthlyModelUsage,
    monthlyRows,
    monthlyRowsPagination,
    overviewCards,
    projectUsage,
    sessionError,
    sessionRows,
    sessionRowsPagination,
    sessionStatus,
    sessionUsage,
    sessionUsagePagination,
    status,
    weeklyRows,
    weeklyRowsPagination,
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
