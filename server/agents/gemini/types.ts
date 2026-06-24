export interface GeminiSessionFileRaw {
    createdAt?: string
    id?: string
    lastUpdated?: string
    messages?: GeminiMessageRaw[]
    model?: string
    result?: GeminiTokensRaw
    sessionId?: string
    startTime?: string
    stats?: GeminiTokensRaw
    summary?: string
    timestamp?: string
    tokens?: GeminiTokensRaw
    type?: 'gemini' | (string & {})
}

export interface GeminiMessageRaw {
    content?: unknown
    model?: string
    timestamp?: string
    tokens?: GeminiTokensRaw
    type: 'gemini' | 'user' | (string & {})
}

export interface GeminiTokensRaw {
    cached?: number
    cached_tokens?: number
    candidates?: number
    candidates_tokens?: number
    input?: number
    input_tokens?: number
    output?: number
    output_tokens?: number
    prompt?: number
    prompt_tokens?: number
    reasoning?: number
    reasoning_tokens?: number
    thoughts?: number
    thoughts_tokens?: number
    tool?: number
    tool_tokens?: number
    total?: number
    total_tokens?: number
}
