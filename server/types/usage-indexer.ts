import type { ProjectUsagePlatform, ProjectUsagePlatformRecord } from '#shared/types/ai'
import type { ProjectInteractionRole, ProjectInteractionUsage, ProjectSessionUsageItem } from '#shared/types/usage-dashboard'

export interface IndexedUsageInteraction {
    content: string
    costUSD: number
    dedupeKey?: string | null
    fallbackDedupeKey?: string | null
    index: number
    isSidechain?: boolean
    model: string | null
    role: ProjectInteractionRole
    timestamp: string | null
    type: string
    usage: ProjectInteractionUsage | null
}

export interface IndexedUsageSessionFragment {
    durationEndAt: string
    key: string
    project: string
    repository: string
    sessionId: string
    startedAt: string | null
    threadName: string
    interactions: IndexedUsageInteraction[]
}

export interface IndexedUsageSourceFile {
    path: string
    platform: ProjectUsagePlatform
    payload: IndexedUsageSessionFragment[]
    projectNames: string[]
    cacheSignature: string
    size: number
    mtimeMs: number
    updatedAt: string
}

export interface UpdatedUsageSession {
    platform: ProjectUsagePlatform
    sessionId: string
}

export interface IncrementalUsageIndexTiming {
    aggregateMs: number
    discoveryMs: number
    parseMs: number
}

export interface IncrementalUsageIndexResult {
    affectedProjects: string[]
    bootstrapByPlatform: ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>
    hasChanges: boolean
    indexedFiles: IndexedUsageSourceFile[]
    timing: IncrementalUsageIndexTiming
    removedProjects: string[]
    updatedSessions: UpdatedUsageSession[]
    updatedPlatforms: readonly ProjectUsagePlatform[]
}
