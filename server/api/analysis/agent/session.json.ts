import { defineRequiredAgentAnalysisHandler } from '#server/utils/analysis'

export default defineRequiredAgentAnalysisHandler(dashboard => dashboard.sessionUsage)
