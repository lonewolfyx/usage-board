import type { DiscoveredUsageFile } from '#server/services/usage-indexer/platform-adapter'
import type { IndexedUsageInteraction, IndexedUsageSessionFragment } from '#server/types/usage-indexer'
import type { ProjectUsagePlatform } from '#shared/types/ai'
import type { ProjectInteractionRole } from '#shared/types/usage-dashboard'
import { statSync } from 'node:fs'

export function toDiscoveredUsageFile(filePath: string, platform: ProjectUsagePlatform) {
    try {
        const stats = statSync(filePath)

        return [{
            mtimeMs: stats.mtimeMs,
            path: filePath,
            platform,
            size: stats.size,
        }] satisfies DiscoveredUsageFile[]
    }
    catch {
        return [] as DiscoveredUsageFile[]
    }
}

export function createSessionFragment(options: {
    project: string
    repository: string
    sessionId: string
    startedAt: string | null
    threadName: string
}) {
    return {
        durationEndAt: '',
        interactions: [],
        key: getSessionLookupKey(options.project, options.sessionId),
        project: options.project,
        repository: options.repository,
        sessionId: options.sessionId,
        startedAt: options.startedAt,
        threadName: options.threadName,
    } satisfies IndexedUsageSessionFragment
}

export function addFragmentInteraction(fragment: IndexedUsageSessionFragment, interaction: IndexedUsageInteraction) {
    fragment.interactions.push(interaction)

    if (!interaction.timestamp) {
        return
    }

    if (!fragment.startedAt || Date.parse(interaction.timestamp) < Date.parse(fragment.startedAt)) {
        fragment.startedAt = interaction.timestamp
    }

    if (!fragment.durationEndAt || Date.parse(interaction.timestamp) > Date.parse(fragment.durationEndAt)) {
        fragment.durationEndAt = interaction.timestamp
    }
}

export function getSessionLookupKey(project: string, sessionId: string) {
    return `${project}:${sessionId}`
}

export function getRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export function getString(value: unknown) {
    return typeof value === 'string' ? value.trim() : ''
}

export function normalizeOptionalNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function normalizeRole(value: string): ProjectInteractionRole {
    const normalized = value.toLowerCase()

    if (normalized.includes('user')) {
        return 'user'
    }

    if (normalized.includes('assistant') || normalized.includes('agent') || normalized.includes('gemini')) {
        return 'assistant'
    }

    if (normalized.includes('system')) {
        return 'system'
    }

    if (normalized.includes('tool')) {
        return 'tool'
    }

    if (normalized.includes('token') || normalized.includes('usage')) {
        return 'usage'
    }

    return 'unknown'
}

export function getValidTimestamp(value: string) {
    return Number.isFinite(Date.parse(value)) ? value : null
}
