import { defineScopedAnalysisHandler } from '#server/utils/analysis'

const HOT_PROJECT_LIMIT = 6

export default defineScopedAnalysisHandler({
    agent: dashboard => dashboard.projectUsage.slice(0, HOT_PROJECT_LIMIT),
    home: modules => modules.hotProjects.slice(0, HOT_PROJECT_LIMIT),
})
