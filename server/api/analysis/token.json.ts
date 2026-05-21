import { defineScopedAnalysisHandler } from '#server/utils/analysis'

export default defineScopedAnalysisHandler({
    agent: dashboard => dashboard.dailyTokenUsage,
    home: modules => modules.dailyTokenUsage,
})
