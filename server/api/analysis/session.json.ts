import type { AnalysisSessionResponse } from '#shared/types/analysis'
import { defineHomeAnalysisHandler } from '#server/runtime/analysis-handlers'

export default defineHomeAnalysisHandler<AnalysisSessionResponse>(modules => modules.sessionAnalysis)
