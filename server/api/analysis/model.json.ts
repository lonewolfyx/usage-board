import { defineScopedAnalysisHandler } from '#server/runtime/analysis-handlers'

export default defineScopedAnalysisHandler({
    agent: dashboard => dashboard.monthlyModelUsage,
    home: modules => modules.modelUsage,
})
