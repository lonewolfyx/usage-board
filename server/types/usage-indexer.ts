import type { ProjectUsagePlatform, ProjectUsagePlatformRecord } from '#shared/types/ai'
import type { ProjectInteractionRole, ProjectInteractionUsage, ProjectSessionUsageItem } from '#shared/types/usage-dashboard'

export interface IndexedUsageInteraction {
    content: string
    costUSD: number
    dedupeKey?: string | null
    index: number
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
    size: number
    mtimeMs: number
    updatedAt: string
}

export interface IncrementalUsageIndexResult {
    affectedProjects: string[]
    bootstrapByPlatform: ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>
    indexedFiles: IndexedUsageSourceFile[]
    removedProjects: string[]
}
