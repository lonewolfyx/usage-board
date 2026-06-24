export interface CodebuffUsageRaw {
    cache_creation_input_tokens?: number
    cache_creation_tokens?: number
    cache_read_input_tokens?: number
    cacheCreationInputTokens?: number
    cacheCreationTokens?: number
    cacheReadInputTokens?: number
    cachedTokensCreated?: number
    cached_tokens_created?: number
    completion_tokens?: number
    completionTokens?: number
    credits?: number
    input_tokens?: number
    inputTokens?: number
    model?: string
    output_tokens?: number
    outputTokens?: number
    prompt_tokens?: number
    promptTokens?: number
    promptTokensDetails?: { cachedTokens?: number }
    prompt_tokens_details?: { cached_tokens?: number }
    total?: number
    total_tokens?: number
    totalTokens?: number
}

interface CodebuffProviderOptionsRaw {
    codebuff?: { model?: string, usage?: CodebuffUsageRaw }
    usage?: CodebuffUsageRaw
}

interface CodebuffRunStateMessageRaw {
    providerOptions?: CodebuffProviderOptionsRaw
    role?: string
}

interface CodebuffRunStateRaw {
    sessionState?: {
        mainAgentState?: {
            messageHistory?: CodebuffRunStateMessageRaw[]
        }
    }
}

export interface CodebuffMetadataRaw {
    codebuff?: { model?: string, usage?: CodebuffUsageRaw }
    model?: string
    runState?: CodebuffRunStateRaw
    timestamp?: string
    usage?: CodebuffUsageRaw
}

export interface CodebuffMessageRaw {
    createdAt?: string
    credits?: number
    id?: string
    metadata?: CodebuffMetadataRaw
    role?: string
    timestamp?: string
    variant?: string
}
