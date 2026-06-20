import type { HomeDashboardModulesResponse } from '#shared/types/analysis'
import {
    createEmptyHomeDashboardCoreModules,
    createEmptyHomeDashboardSessionModules,
    createEmptyHomeDashboardUsageModules,
} from '#shared/utils/analysis-dashboard'
import {
    fetchHomeDashboardDailyTokenPage,
    fetchHomeDashboardModules,
} from '~/lib/analysis-repository'

export function useHomeDashboard() {
    const defaultDashboardModules = {
        ...createEmptyHomeDashboardCoreModules(),
        ...createEmptyHomeDashboardUsageModules(),
        ...createEmptyHomeDashboardSessionModules(),
        updatedAt: '',
    }
    const {
        data: dashboardData,
        error: dashboardError,
        refresh,
        status: dashboardStatus,
    } = useAsyncData<HomeDashboardModulesResponse>('analysis:home:modules', fetchHomeDashboardModules, {
        default: () => defaultDashboardModules,
    })
    const {
        data: dailyTokenUsagePageData,
        error: dailyTokenUsagePageError,
        execute: executeDailyTokenUsagePage,
        status: dailyTokenUsagePageStatus,
    } = useAsyncData('analysis:home:daily-token-page', () => fetchHomeDashboardDailyTokenPage(1), {
        immediate: false,
        server: false,
    })

    useUsageLiveUpdate(() => refresh())

    watch(dashboardStatus, (status) => {
        if (status === 'success' && dailyTokenUsagePageStatus.value === 'idle') {
            void executeDailyTokenUsagePage()
        }
    }, {
        immediate: true,
    })

    return {
        dailyTokenUsage: computed(() => dashboardData.value?.dailyTokenUsage ?? defaultDashboardModules.dailyTokenUsage),
        dailyTokenUsagePage: computed(() => dailyTokenUsagePageData.value),
        dailyTokenUsagePageError,
        dailyTokenUsagePageStatus,
        fetchDailyTokenUsagePage: fetchHomeDashboardDailyTokenPage,
        efficiencyMetrics: computed(() => dashboardData.value?.efficiencyMetrics ?? defaultDashboardModules.efficiencyMetrics),
        error: dashboardError,
        monthlyModelUsage: computed(() => dashboardData.value?.modelUsage ?? defaultDashboardModules.modelUsage),
        overviewCards: computed(() => dashboardData.value?.overviewCards ?? defaultDashboardModules.overviewCards),
        projectUsage: computed(() => dashboardData.value?.hotProjects ?? defaultDashboardModules.hotProjects),
        refresh,
        sessionAnalysisError: dashboardError,
        sessionAnalysisStatus: dashboardStatus,
        sessionUsage: computed(() => dashboardData.value?.sessionAnalysis.items ?? defaultDashboardModules.sessionAnalysis.items),
        status: dashboardStatus,
        todayHourlyUsage: computed(() => dashboardData.value?.todayHourlyUsage ?? defaultDashboardModules.todayHourlyUsage),
        totalSessions: computed(() => dashboardData.value?.sessionAnalysis.totalSessions ?? defaultDashboardModules.sessionAnalysis.totalSessions),
        usageError: dashboardError,
        usageStatus: dashboardStatus,
    }
}
