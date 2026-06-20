import { getAnalysisRuntime, getRequiredAnalysisAgent, getRequiredAnalysisAgentTokenType } from '#server/utils/analysis'
import { getPaginationQuery } from '#server/utils/pagination'

export default defineEventHandler(async (event) => {
    const type = getRequiredAnalysisAgentTokenType(event)
    const modules = await getAnalysisRuntime(event).getAgentDashboardModules(
        getRequiredAnalysisAgent(event),
        getPaginationQuery(event),
    )
    const rowsByType = {
        day: {
            items: modules.dailyRows,
            pagination: modules.dailyRowsPagination,
        },
        month: {
            items: modules.monthlyRows,
            pagination: modules.monthlyRowsPagination,
        },
        session: {
            items: modules.sessionRows,
            pagination: modules.sessionRowsPagination,
        },
        week: {
            items: modules.weeklyRows,
            pagination: modules.weeklyRowsPagination,
        },
    }

    return rowsByType[type]
})
