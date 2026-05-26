import { defineHomeAnalysisHandler } from '#server/utils/analysis'

export default defineHomeAnalysisHandler(modules => modules.todayHourlyUsage)
