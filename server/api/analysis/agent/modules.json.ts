import type { AgentDashboardModulesResponse } from '#shared/types/analysis'
import { getAnalysisRuntime, getRequiredAnalysisAgent } from '#server/utils/analysis'
import { getPaginationQuery } from '#server/utils/pagination'

export default defineEventHandler(async (event) => {
    return await getAnalysisRuntime(event).getAgentDashboardModuleSnapshot(
        getRequiredAnalysisAgent(event),
        getPaginationQuery(event),
    ) satisfies AgentDashboardModulesResponse
})
