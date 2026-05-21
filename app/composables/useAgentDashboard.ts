import type { ProjectUsagePlatform } from '#shared/types/ai'
import type { AgentDashboardCoreModules } from '#shared/types/analysis'
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

    return {
        dailyRows: computed(() => coreDashboard.value.dailyRows),
        dailyTokenUsage: computed(() => coreDashboard.value.dailyTokenUsage),
        error: coreError,
        insightsError,
        insightsStatus,
        monthlyModelUsage: computed(() => coreDashboard.value.monthlyModelUsage),
        monthlyRows: computed(() => insightsDashboard.value.monthlyRows),
        overviewCards: computed(() => coreDashboard.value.overviewCards),
        projectUsage: computed(() => insightsDashboard.value.projectUsage),
        refresh,
        sessionError,
        sessionRows: computed(() => insightsDashboard.value.sessionRows),
        sessionStatus,
        sessionUsage: computed(() => sessionDashboard.value.sessionUsage),
        status: coreStatus,
        weeklyRows: computed(() => insightsDashboard.value.weeklyRows),
    }
}
