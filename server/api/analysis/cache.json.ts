import type { AnalysisCacheResponse } from '#shared/types/analysis'
import { defineHomeAnalysisHandler } from '#server/utils/analysis'

export default defineHomeAnalysisHandler<AnalysisCacheResponse>(modules => ({
    dailyItems: modules.dailyTokenUsage,
    items: modules.efficiencyMetrics,
}))
