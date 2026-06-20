import type { HomeDashboardModulesResponse } from '#shared/types/analysis'
import { getAnalysisRuntime } from '#server/utils/analysis'

export default defineEventHandler(async (event) => {
    return await getAnalysisRuntime(event).getHomeDashboardModuleSnapshot() satisfies HomeDashboardModulesResponse
})
