import type { ProjectUsagePlatform } from '#shared/types/ai'
import type { LoadUsageResult } from '#shared/types/usage-dashboard'
import { computed } from 'vue'
import { usePayloadContext } from '~/composables/usePayloadContext'

export const EMPTY_LOAD_USAGE_RESULT: LoadUsageResult = {
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

export function usePayloadDashboard(key: ProjectUsagePlatform) {
    const { payload } = usePayloadContext()

    const dashboard = computed<LoadUsageResult>(() => {
        return (payload.value?.[key] as LoadUsageResult | undefined) ?? EMPTY_LOAD_USAGE_RESULT
    })

    return {
        dailyRows: computed(() => dashboard.value.dailyRows),
        dailyTokenUsage: computed(() => dashboard.value.dailyTokenUsage),
        monthlyModelUsage: computed(() => dashboard.value.monthlyModelUsage),
        monthlyRows: computed(() => dashboard.value.monthlyRows),
        overviewCards: computed(() => dashboard.value.overviewCards),
        projectUsage: computed(() => dashboard.value.projectUsage),
        sessionRows: computed(() => dashboard.value.sessionRows),
        sessionUsage: computed(() => dashboard.value.sessionUsage),
        weeklyRows: computed(() => dashboard.value.weeklyRows),
    }
}
