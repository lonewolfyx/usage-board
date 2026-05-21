import type { AnalysisSessionResponse } from '#shared/types/analysis'
import { defineHomeAnalysisHandler } from '#server/utils/analysis'

export default defineHomeAnalysisHandler<AnalysisSessionResponse>(modules => modules.sessionAnalysis)
