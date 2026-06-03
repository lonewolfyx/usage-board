import type { ProjectUsagePlatform } from '#shared/types/ai'
import type { AgentDashboardCoreModules, AnalysisAgentTokenType } from '#shared/types/analysis'
import type { MaybeRefOrGetter } from 'vue'
import {
    createEmptyAgentDashboardCoreModules,
    createEmptyAgentDashboardInsightsModules,
    createEmptyAgentDashboardSessionModules,
} from '#shared/utils/analysis-dashboard'
import {
    fetchAgentDashboardCoreModules,
    fetchAgentDashboardInsightsModules,
    fetchAgentDashboardSessionModules,
    fetchAgentSessionPage,
    fetchAgentTokenPage,
} from '~/lib/analysis-repository'

export function useAgentDashboard(agent: MaybeRefOrGetter<ProjectUsagePlatform>) {
    const agentKey = computed(() => toValue(agent))

    const {
        data: coreData,
        error: coreError,
        refresh: refreshCore,
        status: coreStatus,
    } = useAsyncData<AgentDashboardCoreModules>(() => `analysis:agent:${agentKey.value}:core`, () => fetchAgentDashboardCoreModules(agentKey.value), {
        default: createEmptyAgentDashboardCoreModules,
        watch: [agentKey],
    })
    const {
        clear: clearInsights,
        data: insightsData,
        error: insightsError,
        execute: executeInsights,
        refresh: refreshInsights,
        status: insightsStatus,
    } = useAsyncData(() => `analysis:agent:${agentKey.value}:insights`, () => fetchAgentDashboardInsightsModules(agentKey.value), {
        default: createEmptyAgentDashboardInsightsModules,
        immediate: false,
        server: false,
    })
    const {
        clear: clearSessionModules,
        data: sessionData,
        error: sessionError,
        execute: executeSessionModules,
        refresh: refreshSessionModules,
        status: sessionStatus,
    } = useAsyncData(() => `analysis:agent:${agentKey.value}:session`, () => fetchAgentDashboardSessionModules(agentKey.value), {
        default: createEmptyAgentDashboardSessionModules,
        immediate: false,
        server: false,
    })

    const coreDashboard = computed(() => coreData.value ?? createEmptyAgentDashboardCoreModules())
    const insightsDashboard = computed(() => insightsData.value ?? createEmptyAgentDashboardInsightsModules())
    const sessionDashboard = computed(() => sessionData.value ?? createEmptyAgentDashboardSessionModules())
    const { refresh } = useDeferredDashboardLoader({
        clearDeferred: () => {
            clearInsights()
            clearSessionModules()
        },
        coreStatus,
        executeDeferred: () => Promise.all([
            executeInsights(),
            executeSessionModules(),
        ]),
        refreshCore,
        refreshDeferred: () => Promise.all([
            refreshInsights(),
            refreshSessionModules(),
        ]),
    })

    useUsageLiveUpdate((update) => {
        if (!update.updatedPlatforms.includes(agentKey.value)) {
            return
        }

        return refresh()
    })

    return {
        dailyRows: computed(() => coreDashboard.value.dailyRows),
        dailyRowsPagination: computed(() => coreDashboard.value.dailyRowsPagination),
        dailyTokenUsage: computed(() => coreDashboard.value.dailyTokenUsage),
        error: coreError,
        fetchSessionUsagePage: (page: number) => fetchAgentSessionPage(agentKey.value, page),
        fetchTokenUsagePage: (type: AnalysisAgentTokenType, page: number) => fetchAgentTokenPage(agentKey.value, type, page),
        insightsError,
        insightsStatus,
        monthlyModelUsage: computed(() => coreDashboard.value.monthlyModelUsage),
        monthlyRows: computed(() => insightsDashboard.value.monthlyRows),
        monthlyRowsPagination: computed(() => insightsDashboard.value.monthlyRowsPagination),
        overviewCards: computed(() => coreDashboard.value.overviewCards),
        projectUsage: computed(() => insightsDashboard.value.projectUsage),
        refresh,
        sessionError,
        sessionRows: computed(() => insightsDashboard.value.sessionRows),
        sessionRowsPagination: computed(() => insightsDashboard.value.sessionRowsPagination),
        sessionStatus,
        sessionUsage: computed(() => sessionDashboard.value.sessionUsage),
        sessionUsagePagination: computed(() => sessionDashboard.value.sessionUsagePagination),
        status: coreStatus,
        weeklyRows: computed(() => insightsDashboard.value.weeklyRows),
        weeklyRowsPagination: computed(() => insightsDashboard.value.weeklyRowsPagination),
    }
}
