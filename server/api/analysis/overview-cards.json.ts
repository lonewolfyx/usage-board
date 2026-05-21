import { defineScopedAnalysisHandler } from '#server/utils/analysis'

export default defineScopedAnalysisHandler({
    agent: dashboard => dashboard.overviewCards,
    home: modules => modules.overviewCards,
})
