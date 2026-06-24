interface ClaudeUsageRaw {
    cache_creation?: {
        ephemeral_1h_input_tokens?: null | number
        ephemeral_5m_input_tokens?: null | number
    }
    cache_creation_input_tokens?: null | number
    cache_read_input_tokens?: null | number
    input_tokens?: null | number
    output_tokens?: null | number
    speed?: 'fast' | 'standard' | null
}

export interface ClaudeMessageRaw {
    id?: null | string
    model?: null | string
    role?: null | 'assistant' | 'system' | 'user' | (string & {})
    type?: null | 'message' | (string & {})
    usage?: ClaudeUsageRaw | null
}

export interface ClaudeLineRaw {
    costUSD?: null | number
    cwd?: null | string
    data?: {
        message?: {
            costUSD?: null | number
            isSidechain?: boolean
            message?: ClaudeMessageRaw | null
            requestId?: null | string
            timestamp?: string
            type?: string
        }
    }
    isApiErrorMessage?: boolean | null
    isSidechain?: boolean
    message?: ClaudeMessageRaw | null
    requestId?: null | string
    sessionId?: null | string
    timestamp: string
    type?: string
    version?: null | string
}
