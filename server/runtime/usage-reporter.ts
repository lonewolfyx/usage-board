import type { UsageInteractionFact } from '#server/agents/shared/fact'
import type { ProjectUsagePlatform } from '#shared/types/ai'
import { PROJECT_USAGE_PLATFORM_META } from '#shared/platform/metadata'
import { log } from '@clack/prompts'

export class UsageRuntimeConsoleReporter {
    start() {
        log.step('Reading AI coding session records...')
    }

    foundSources(stats: {
        cachedFiles: number
        changedFiles: number
        discoveredFiles: number
        removedFiles: number
        updatedPlatforms: readonly ProjectUsagePlatform[]
    }) {
        log.info(`Updated agents detected: ${formatPlatformLabels(stats.updatedPlatforms)}`)

        log.info(`Found ${stats.discoveredFiles} session record files, ${stats.cachedFiles} from DB`)

        if (stats.updatedPlatforms.length > 0) {
            log.info(`Processing updated agents: ${formatPlatformLabels(stats.updatedPlatforms)}`)
        }

        if (stats.removedFiles > 0) {
            log.info(`Detected ${stats.removedFiles} deleted session files, syncing DB`)
        }
        else if (stats.changedFiles === 0) {
            log.info(`DB cache hit: ${stats.cachedFiles} session files, no source re-parse needed`)
        }
    }

    finishPlatform(platform: ProjectUsagePlatform, stats: {
        durationMs: number
        facts: UsageInteractionFact[]
        parsedFiles: number
    }) {
        const sessions = new Set(stats.facts.map(fact => fact.sessionId))
        log.success(`${PROJECT_USAGE_PLATFORM_META[platform].label} indexing complete: parsed ${stats.parsedFiles} source files, upserted ${sessions.size} sessions, ${stats.facts.length} interactions, took ${formatDurationMs(stats.durationMs)}`)
    }

    finishCacheWrite(stats: {
        durationMs: number
        factCount: number
        projectCount: number
        sourceFileCount: number
        updatedSessions: Array<{ platform: ProjectUsagePlatform, repository: string, sessionId: string }>
    }) {
        log.success(`DB write complete: ${stats.sourceFileCount} source files, ${stats.factCount} interactions, ${stats.projectCount} projects${formatUpdatedSessionSummary(stats.updatedSessions)}, took ${formatDurationMs(stats.durationMs)}`)
    }

    complete(stats: {
        durationMs: number
        parseMs: number
        sourceDiscoveryMs: number
        writeMs: number
    }) {
        log.success(`Indexing complete, took ${formatDurationMs(stats.durationMs)} (discovery ${formatDurationMs(stats.sourceDiscoveryMs)}, parse ${formatDurationMs(stats.parseMs)}, write ${formatDurationMs(stats.writeMs)})`)
    }

    fail(error: unknown) {
        log.error(`Indexing failed: ${error instanceof Error ? error.message : String(error)}`)
    }
}

function formatDurationMs(durationMs: number) {
    if (durationMs < 1000) {
        return `${durationMs}ms`
    }

    return `${(durationMs / 1000).toFixed(1)}s`
}

function formatPlatformLabels(platforms: readonly ProjectUsagePlatform[]) {
    return platforms.map(platform => PROJECT_USAGE_PLATFORM_META[platform].label).join(' / ')
}

function formatUpdatedSessionSummary(updatedSessions: Array<{ platform: ProjectUsagePlatform, repository: string, sessionId: string }>) {
    if (updatedSessions.length === 0) {
        return ''
    }

    const limit = 5
    const labels = updatedSessions
        .slice(0, limit)
        .map(({ platform, repository, sessionId }) => `${PROJECT_USAGE_PLATFORM_META[platform].label}:${repository ? `${repository}:` : ''}${sessionId}`)
    const remainingCount = updatedSessions.length - labels.length

    return remainingCount > 0
        ? `, session ids ${labels.join(', ')} and ${remainingCount} more`
        : `, session ids ${labels.join(', ')}`
}
