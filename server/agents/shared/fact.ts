import type { ProjectUsagePlatform } from '#shared/types/ai'

type InteractionRole
    = | 'assistant'
        | 'message'
        | 'system'
        | 'tool'
        | 'usage'
        | 'user'
        | (string & {})

export interface InteractionUsage {
    cacheCreation1hTokens: number
    cacheCreation5mTokens: number
    cacheCreationTokens: number
    cacheReadTokens: number
    extraTotalTokens: number
    inputTokens: number
    outputTokens: number
    reasoningOutputTokens: number
    toolTokens: number
    totalTokens: number
}

export interface UsageSourceFile {
    cacheSignature: string
    mtimeMs: number
    path: string
    platform: ProjectUsagePlatform
    size: number
}

export interface UsageInteractionFact {
    dedupeKey: string | null
    fallbackDedupeKey: string | null
    hasSpeed?: boolean
    interactionIndex: number
    isSidechain: boolean
    model: string | null
    modelLookupCandidates: string[]
    platform: ProjectUsagePlatform
    project: string
    provider: string | null
    rawCostUSD: number | null
    repository: string
    role: InteractionRole
    sessionId: string
    sourceFile: string
    sourceFileMtime: number
    speed: 'fast' | 'standard'
    threadName: string
    timestamp: string
    type: string
    usage: InteractionUsage
}

export interface AgentAdapterResult {
    facts: UsageInteractionFact[]
    source: UsageSourceFile
}

export interface AgentAdapter {
    discoverSources: () => Promise<UsageSourceFile[]>
    loadSource: (source: UsageSourceFile) => Promise<AgentAdapterResult>
    platform: ProjectUsagePlatform
    watchSourcePatterns: () => string[]
}
