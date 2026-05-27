import { defineRequiredAgentAnalysisHandler } from '#server/utils/analysis'
import { getPaginationQuery } from '#server/utils/pagination'
import { paginateItems } from '#shared/utils/pagination'

export default defineRequiredAgentAnalysisHandler((dashboard, event) => {
    return paginateItems(dashboard.sessionUsage.map(session => ({
        costUSD: session.costUSD,
        duration: session.duration,
        id: session.id,
        inputTokens: session.inputTokens,
        model: session.model,
        outputTokens: session.outputTokens,
        project: session.project,
        sessionId: session.sessionId,
        startedAt: session.startedAt,
        threadName: session.threadName,
        tokenTotal: session.tokenTotal,
    })), getPaginationQuery(event))
})
