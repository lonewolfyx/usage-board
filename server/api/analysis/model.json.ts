import { defineScopedAnalysisHandler } from '#server/utils/analysis'

export default defineScopedAnalysisHandler({
    agent: dashboard => dashboard.monthlyModelUsage,
    home: modules => modules.modelUsage,
})
