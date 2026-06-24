export interface DroidSettingsRaw {
    model?: string
    providerLock?: string
    providerLockTimestamp?: string | number
    tokenUsage?: {
        cacheCreationTokens?: number
        cacheReadTokens?: number
        inputTokens?: number
        outputTokens?: number
        thinkingTokens?: number
        totalTokens?: number
    }
}
