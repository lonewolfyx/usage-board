import type { HomeDashboardCoreModules } from '#shared/types/analysis'
import {
    createEmptyHomeDashboardCoreModules,
    createEmptyHomeDashboardSessionModules,
    createEmptyHomeDashboardUsageModules,
} from '#shared/utils/analysis-dashboard'
import {
    fetchHomeDashboardCoreModules,
    fetchHomeDashboardDailyTokenPage,
    fetchHomeDashboardSessionAnalysis,
    fetchHomeDashboardUsageModules,
} from '~/lib/analysis-repository'

export function useHomeDashboard() {
    const defaultCoreModules = createEmptyHomeDashboardCoreModules()
    const defaultUsageModules = createEmptyHomeDashboardUsageModules()
    const defaultSessionAnalysis = createEmptyHomeDashboardSessionModules().sessionAnalysis
    const {
        data: coreData,
        error: coreError,
        refresh: refreshCore,
        status: coreStatus,
    } = useAsyncData<HomeDashboardCoreModules>('analysis:home:core', fetchHomeDashboardCoreModules, {
        default: createEmptyHomeDashboardCoreModules,
    })
    const {
        clear: clearUsage,
        data: usageData,
        error: usageError,
        execute: executeUsage,
        refresh: refreshUsage,
        status: usageStatus,
    } = useAsyncData('analysis:home:usage', fetchHomeDashboardUsageModules, {
        default: createEmptyHomeDashboardUsageModules,
        immediate: false,
        server: false,
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
    const {
        clear: clearSessionAnalysis,
        data: sessionAnalysisData,
        error: sessionAnalysisError,
        execute: executeSessionAnalysis,
        refresh: refreshSessionAnalysis,
        status: sessionAnalysisStatus,
    } = useAsyncData('analysis:home:session', fetchHomeDashboardSessionAnalysis, {
        default: () => createEmptyHomeDashboardSessionModules().sessionAnalysis,
        immediate: false,
        server: false,
    })

    const { refresh } = useDeferredDashboardLoader({
        clearDeferred: () => {
            clearUsage()
            clearSessionAnalysis()
        },
        coreStatus,
        executeDeferred: () => Promise.all([
            executeUsage(),
            executeSessionAnalysis(),
        ]),
        refreshCore,
        refreshDeferred: () => Promise.all([
            refreshUsage(),
            refreshSessionAnalysis(),
        ]),
    })

    useUsageLiveUpdate(() => refresh())

    watch(usageStatus, (status) => {
        if (status === 'success' && dailyTokenUsagePageStatus.value === 'idle') {
            void executeDailyTokenUsagePage()
        }
    }, {
        immediate: true,
    })

    return {
        dailyTokenUsage: computed(() => usageData.value?.dailyTokenUsage ?? defaultUsageModules.dailyTokenUsage),
        dailyTokenUsagePage: computed(() => dailyTokenUsagePageData.value),
        dailyTokenUsagePageError,
        dailyTokenUsagePageStatus,
        fetchDailyTokenUsagePage: fetchHomeDashboardDailyTokenPage,
        efficiencyMetrics: computed(() => usageData.value?.efficiencyMetrics ?? defaultUsageModules.efficiencyMetrics),
        error: coreError,
        monthlyModelUsage: computed(() => coreData.value?.modelUsage ?? defaultCoreModules.modelUsage),
        overviewCards: computed(() => coreData.value?.overviewCards ?? defaultCoreModules.overviewCards),
        projectUsage: computed(() => coreData.value?.hotProjects ?? defaultCoreModules.hotProjects),
        refresh,
        sessionAnalysisError,
        sessionAnalysisStatus,
        sessionUsage: computed(() => sessionAnalysisData.value?.items ?? defaultSessionAnalysis.items),
        status: coreStatus,
        todayHourlyUsage: computed(() => usageData.value?.todayHourlyUsage ?? defaultUsageModules.todayHourlyUsage),
        totalSessions: computed(() => sessionAnalysisData.value?.totalSessions ?? defaultSessionAnalysis.totalSessions),
        usageError,
        usageStatus,
    }
}
