export interface PiLineRaw {
    message?: {
        model?: string
        role: 'assistant' | 'user' | (string & {})
        usage?: {
            cacheRead?: number
            cacheWrite?: number
            cost?: { total?: number }
            input?: number
            output?: number
            totalTokens?: number
        }
    }
    timestamp?: string
    type?: string
}
