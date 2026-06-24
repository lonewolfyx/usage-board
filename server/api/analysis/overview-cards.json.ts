import { defineScopedAnalysisHandler } from '#server/runtime/analysis-handlers'
import { buildOverviewCardsWithTodayTokenBreakdown } from '#shared/utils/usage-dashboard'

export default defineScopedAnalysisHandler({
    agent: dashboard => buildOverviewCardsWithTodayTokenBreakdown(dashboard.overviewCards, dashboard.dailyTokenUsage),
    home: modules => buildOverviewCardsWithTodayTokenBreakdown(modules.overviewCards, modules.dailyTokenUsage),
})
