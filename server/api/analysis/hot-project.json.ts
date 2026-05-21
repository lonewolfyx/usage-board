import { defineScopedAnalysisHandler } from '#server/utils/analysis'

export default defineScopedAnalysisHandler({
    agent: dashboard => dashboard.projectUsage,
    home: modules => modules.hotProjects,
})
