export interface QwenLineRaw {
    model?: string
    timestamp?: string
    type: 'assistant' | 'user' | (string & {})
    usageMetadata?: {
        cachedContentTokenCount?: number
        candidatesTokenCount: number
        promptTokenCount: number
        thoughtsTokenCount?: number
        totalTokenCount: number
    }
}
