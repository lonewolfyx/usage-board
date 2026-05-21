import type { HomeDashboardCoreModules } from '#shared/types/analysis'
import {
    createEmptyHomeDashboardCoreModules,
    createEmptyHomeDashboardSessionModules,
    createEmptyHomeDashboardUsageModules,
} from '#shared/utils/analysis-dashboard'
import {
    fetchHomeDashboardCoreModules,
    fetchHomeDashboardSessionAnalysis,
    fetchHomeDashboardUsageModules,
} from '~/lib/analysis-repository'

export function useHomeDashboard() {
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

    const coreDashboard = computed(() => coreData.value ?? createEmptyHomeDashboardCoreModules())
    const usageDashboard = computed(() => usageData.value ?? createEmptyHomeDashboardUsageModules())
    const sessionDashboard = computed(() => sessionAnalysisData.value ?? createEmptyHomeDashboardSessionModules().sessionAnalysis)
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

    return {
        dailyTokenUsage: computed(() => usageDashboard.value.dailyTokenUsage),
        efficiencyMetrics: computed(() => usageDashboard.value.efficiencyMetrics),
        error: coreError,
        monthlyModelUsage: computed(() => coreDashboard.value.modelUsage),
        overviewCards: computed(() => coreDashboard.value.overviewCards),
        projectUsage: computed(() => coreDashboard.value.hotProjects),
        refresh,
        sessionAnalysisError,
        sessionAnalysisStatus,
        sessionUsage: computed(() => sessionDashboard.value.items),
        status: coreStatus,
        totalSessions: computed(() => sessionDashboard.value.totalSessions),
        usageError,
        usageStatus,
    }
}
