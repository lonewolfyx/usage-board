import type { ProjectUsagePlatform } from '#shared/types/ai'
import type { AgentDashboardModulesResponse, AnalysisAgentTokenType } from '#shared/types/analysis'
import type { MaybeRefOrGetter } from 'vue'
import {
    createEmptyAgentDashboardCoreModules,
    createEmptyAgentDashboardInsightsModules,
    createEmptyAgentDashboardSessionModules,
} from '#shared/utils/analysis-dashboard'
import {
    fetchAgentDashboardModules,
    fetchAgentSessionPage,
    fetchAgentTokenPage,
} from '~/lib/analysis-repository'

export function useAgentDashboard(agent: MaybeRefOrGetter<ProjectUsagePlatform>) {
    const agentKey = computed(() => toValue(agent))
    const defaultDashboardModules = {
        ...createEmptyAgentDashboardCoreModules(),
        ...createEmptyAgentDashboardInsightsModules(),
        ...createEmptyAgentDashboardSessionModules(),
        updatedAt: '',
    }

    const {
        data: dashboardData,
        error: dashboardError,
        refresh,
        status: dashboardStatus,
    } = useAsyncData<AgentDashboardModulesResponse>(() => `analysis:agent:${agentKey.value}:modules`, () => fetchAgentDashboardModules(agentKey.value), {
        default: () => defaultDashboardModules,
        watch: [agentKey],
    })
    const dashboard = computed(() => dashboardData.value ?? defaultDashboardModules)

    useUsageLiveUpdate((update) => {
        if (!update.updatedPlatforms.includes(agentKey.value)) {
            return
        }

        return refresh()
    })

    return {
        dailyRows: computed(() => dashboard.value.dailyRows),
        dailyRowsPagination: computed(() => dashboard.value.dailyRowsPagination),
        dailyTokenUsage: computed(() => dashboard.value.dailyTokenUsage),
        error: dashboardError,
        fetchSessionUsagePage: (page: number) => fetchAgentSessionPage(agentKey.value, page),
        fetchTokenUsagePage: (type: AnalysisAgentTokenType, page: number) => fetchAgentTokenPage(agentKey.value, type, page),
        insightsError: dashboardError,
        insightsStatus: dashboardStatus,
        monthlyModelUsage: computed(() => dashboard.value.monthlyModelUsage),
        monthlyRows: computed(() => dashboard.value.monthlyRows),
        monthlyRowsPagination: computed(() => dashboard.value.monthlyRowsPagination),
        overviewCards: computed(() => dashboard.value.overviewCards),
        projectUsage: computed(() => dashboard.value.projectUsage),
        refresh,
        sessionError: dashboardError,
        sessionRows: computed(() => dashboard.value.sessionRows),
        sessionRowsPagination: computed(() => dashboard.value.sessionRowsPagination),
        sessionStatus: dashboardStatus,
        sessionUsage: computed(() => dashboard.value.sessionUsage),
        sessionUsagePagination: computed(() => dashboard.value.sessionUsagePagination),
        status: dashboardStatus,
        weeklyRows: computed(() => dashboard.value.weeklyRows),
        weeklyRowsPagination: computed(() => dashboard.value.weeklyRowsPagination),
    }
}
