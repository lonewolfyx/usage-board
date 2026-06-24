import { defineScopedAnalysisHandler } from '#server/runtime/analysis-handlers'

export default defineScopedAnalysisHandler({
    agent: dashboard => dashboard.dailyTokenUsage,
    home: modules => modules.dailyTokenUsage,
})
