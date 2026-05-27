import { defineRequiredAgentAnalysisHandler, getRequiredAnalysisAgentTokenType } from '#server/utils/analysis'
import { getPaginationQuery } from '#server/utils/pagination'
import { ANALYSIS_AGENT_TOKEN_ROW_KEYS } from '#shared/types/analysis'
import { paginateItems } from '#shared/utils/pagination'

export default defineRequiredAgentAnalysisHandler((dashboard, event) => {
    const type = getRequiredAnalysisAgentTokenType(event)

    return paginateItems(dashboard[ANALYSIS_AGENT_TOKEN_ROW_KEYS[type]], getPaginationQuery(event))
})
