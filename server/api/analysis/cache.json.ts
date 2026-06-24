import type { AnalysisCacheResponse } from '#shared/types/analysis'
import { defineHomeAnalysisHandler } from '#server/runtime/analysis-handlers'

export default defineHomeAnalysisHandler<AnalysisCacheResponse>(modules => ({
    dailyItems: modules.dailyTokenUsage,
    items: modules.efficiencyMetrics,
}))
