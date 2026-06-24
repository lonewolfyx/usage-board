import { defineHomeAnalysisHandler } from '#server/runtime/analysis-handlers'

export default defineHomeAnalysisHandler(modules => modules.todayHourlyUsage)
