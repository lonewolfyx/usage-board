import { defineRequiredAgentAnalysisHandler, getRequiredAnalysisAgentTokenType } from '#server/utils/analysis'
import { ANALYSIS_AGENT_TOKEN_ROW_KEYS } from '#shared/types/analysis'

export default defineRequiredAgentAnalysisHandler((dashboard, event) => {
    const type = getRequiredAnalysisAgentTokenType(event)

    return dashboard[ANALYSIS_AGENT_TOKEN_ROW_KEYS[type]]
})
