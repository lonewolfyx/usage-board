export interface OpenClawLineRaw {
    customType?: 'model-snapshot' | (string & {})
    data?: { model?: string, modelId?: string, provider?: string }
    message?: {
        model?: string
        modelId?: string
        provider?: string
        role: 'assistant' | 'user' | (string & {})
        timestamp?: string
        usage?: {
            cacheRead?: number
            cacheWrite?: number
            cost?: { total?: number }
            input?: number
            output?: number
            totalTokens?: number
        }
    }
    model?: string
    modelId?: string
    provider?: string
    timestamp?: string
    type: 'custom' | 'message' | 'model_change' | (string & {})
}
