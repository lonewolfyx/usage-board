export interface AmpThreadRaw {
    id?: string
    messages?: AmpMessageRaw[]
    usageLedger?: {
        events?: AmpLedgerEventRaw[]
    }
}

export interface AmpLedgerEventRaw {
    id?: number | string
    model?: string
    timestamp?: string
    tokens?: {
        input?: number
        output?: number
        total?: number
    }
    toMessageId?: number
}

export interface AmpMessageRaw {
    messageId?: number | string
    model?: string
    role?: 'assistant' | 'user' | (string & {})
    timestamp?: string
    usage?: AmpMessageUsageRaw
}

export interface AmpMessageUsageRaw {
    cacheCreationInputTokens?: number
    cacheReadInputTokens?: number
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
}
