import type { LoadUsageResult, PayloadDashboardKey } from '#shared/types/usage-dashboard'
import { computed } from 'vue'
import { usePayloadContext } from '~/composables/usePayloadContext'

const emptyDashboard: LoadUsageResult = {
    dailyRows: [],
    dailyTokenUsage: [],
    monthlyModelUsage: [],
    monthlyRows: [],
    overviewCards: [],
    projectUsage: [],
    sessionRows: [],
    sessionUsage: [],
    todayTopModel: null,
    todayTopProject: null,
    todayTotalCost: 0,
    todayTotalTokens: 0,
    weeklyRows: [],
}

export function usePayloadDashboard(key: PayloadDashboardKey) {
    const {
        clear,
        error,
        execute,
        payload,
        refresh,
        status,
    } = usePayloadContext()

    const dashboard = computed<LoadUsageResult>(() => {
        return (payload.value?.[key] as LoadUsageResult | undefined) ?? emptyDashboard
    })

    return {
        clear,
        dailyRows: computed(() => dashboard.value.dailyRows),
        dailyTokenUsage: computed(() => dashboard.value.dailyTokenUsage),
        dashboard,
        error,
        execute,
        monthlyModelUsage: computed(() => dashboard.value.monthlyModelUsage),
        monthlyRows: computed(() => dashboard.value.monthlyRows),
        overviewCards: computed(() => dashboard.value.overviewCards),
        projectUsage: computed(() => dashboard.value.projectUsage),
        refresh,
        sessionRows: computed(() => dashboard.value.sessionRows),
        sessionUsage: computed(() => dashboard.value.sessionUsage),
        status,
        todayTopModel: computed(() => dashboard.value.todayTopModel),
        todayTopProject: computed(() => dashboard.value.todayTopProject),
        todayTotalCost: computed(() => dashboard.value.todayTotalCost),
        todayTotalTokens: computed(() => dashboard.value.todayTotalTokens),
        weeklyRows: computed(() => dashboard.value.weeklyRows),
    }
}
