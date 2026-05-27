import { defineHomeAnalysisHandler } from '#server/utils/analysis'
import { getPaginationQuery } from '#server/utils/pagination'
import { paginateItems } from '#shared/utils/pagination'

export default defineHomeAnalysisHandler((modules, event) => {
    return paginateItems(modules.dailyTokenUsage.map(item => ({
        cachedInputTokens: item.cachedInputTokens,
        costUSD: item.costUSD,
        date: item.date,
        inputTokens: item.inputTokens,
        models: Object.keys(item.models).sort((left, right) => left.localeCompare(right)),
        outputTokens: item.outputTokens,
        reasoningOutputTokens: item.reasoningOutputTokens,
        totalTokens: item.totalTokens,
    })), getPaginationQuery(event))
})
