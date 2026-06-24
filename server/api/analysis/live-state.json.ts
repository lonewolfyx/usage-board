import type { AnalysisLiveStateResponse } from '#shared/types/analysis'
import { getAnalysisRuntime } from '#server/runtime/analysis-handlers'

export default defineEventHandler(async (event) => {
    return await getAnalysisRuntime(event).getLiveState() satisfies AnalysisLiveStateResponse
})
