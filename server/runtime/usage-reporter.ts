import type { UsageInteractionFact } from '#server/agents/shared/fact'
import type { ProjectUsagePlatform } from '#shared/types/ai'
import { PROJECT_USAGE_PLATFORM_META } from '#shared/platform/metadata'
import { log } from '@clack/prompts'

export class UsageRuntimeConsoleReporter {
    constructor(private readonly options: {
        verboseProgress: boolean
    }) {}

    start() {
        if (this.options.verboseProgress) {
            log.step('正在读取 AI Coding 会话记录...')
        }
    }

    foundSources(stats: {
        cachedFiles: number
        changedFiles: number
        discoveredFiles: number
        removedFiles: number
        updatedPlatforms: readonly ProjectUsagePlatform[]
    }) {
        if (!this.options.verboseProgress) {
            if (stats.updatedPlatforms.length > 0) {
                log.info(`检测到更新的 agent：${formatPlatformLabels(stats.updatedPlatforms)}`)
            }

            return
        }

        log.info(`查找到 ${stats.discoveredFiles} 个会话记录文件，${stats.cachedFiles} 个来自 DB`)

        if (stats.updatedPlatforms.length > 0) {
            log.info(`正在处理更新的 agent：${formatPlatformLabels(stats.updatedPlatforms)}`)
        }

        if (stats.removedFiles > 0) {
            log.info(`检测到 ${stats.removedFiles} 个已删除的历史会话文件，将同步更新 DB`)
        }
        else if (stats.changedFiles === 0) {
            log.info(`DB 已命中 ${stats.cachedFiles} 个会话记录文件，无需重新解析源文件`)
        }
    }

    finishPlatform(platform: ProjectUsagePlatform, stats: {
        durationMs: number
        facts: UsageInteractionFact[]
        parsedFiles: number
    }) {
        if (!this.options.verboseProgress) {
            return
        }

        const sessions = new Set(stats.facts.map(fact => fact.sessionId))
        log.success(`${PROJECT_USAGE_PLATFORM_META[platform].label} 数据清洗完成：解析 ${stats.parsedFiles} 个源文件，新增/更新 ${sessions.size} 个会话，${stats.facts.length} 条交互，用时 ${formatDurationMs(stats.durationMs)}`)
    }

    finishCacheWrite(stats: {
        durationMs: number
        factCount: number
        projectCount: number
        sourceFileCount: number
        updatedSessions: Array<{ platform: ProjectUsagePlatform, repository: string, sessionId: string }>
    }) {
        if (!this.options.verboseProgress) {
            return
        }

        log.success(`DB 写入完成：${stats.sourceFileCount} 个源文件，${stats.factCount} 条交互，${stats.projectCount} 个项目${formatUpdatedSessionSummary(stats.updatedSessions)}，用时 ${formatDurationMs(stats.durationMs)}`)
    }

    complete(stats: {
        durationMs: number
        parseMs: number
        sourceDiscoveryMs: number
        writeMs: number
    }) {
        if (this.options.verboseProgress) {
            log.success(`数据清洗完成，用时 ${formatDurationMs(stats.durationMs)}（发现/对比 ${formatDurationMs(stats.sourceDiscoveryMs)}，解析 ${formatDurationMs(stats.parseMs)}，写库 ${formatDurationMs(stats.writeMs)}）`)
        }
    }

    fail(error: unknown) {
        log.error(`数据清洗失败：${error instanceof Error ? error.message : String(error)}`)
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
        ? `，session ids ${labels.join(', ')} 等 ${updatedSessions.length} 个`
        : `，session ids ${labels.join(', ')}`
}
