import type { UpdatedUsageSession } from '#server/types/usage-indexer'
import type { ProjectUsagePlatform } from '#shared/types/ai'
import { PROJECT_USAGE_PLATFORM_META } from '#shared/platform/metadata'
import { log, progress, spinner } from '@clack/prompts'

export interface UsageCleaningReporter {
    complete: (stats: UsageCleaningCompleteStats) => void
    discoveredFiles: (stats: UsageCleaningScannedStats) => void
    fail: (error: unknown) => void
    foundFiles: (stats: UsageCleaningDiscoveryStats) => void
    finishPlatform: (platform: ProjectUsagePlatform, stats: UsageCleaningPlatformFinishStats) => void
    finishCacheBootstrap: (stats: UsageCleaningCachePhaseStats) => void
    finishCacheProjectCatalog: (stats: UsageCleaningCachePhaseStats) => void
    finishCacheProjectDetail: (stats: UsageCleaningCacheProjectDetailStats) => void
    finishCacheProjectDetails: (stats: UsageCleaningCacheProjectDetailsStats) => void
    finishCacheWrite: (stats: UsageCleaningCacheWriteStats) => void
    parsedPlatformFiles: (platform: ProjectUsagePlatform, stats: UsageCleaningPlatformParseStats) => void
    start: () => void
    startCacheWrite: (stats: UsageCleaningCacheWriteStats) => void
    startPlatform: (platform: ProjectUsagePlatform, stats: UsageCleaningPlatformStartStats) => void
}

export interface UsageCleaningScannedStats {
    discoveredFiles: number
}

export interface UsageCleaningDiscoveryStats {
    cachedFiles: number
    changedFiles: number
    discoveredFiles: number
    removedFiles: number
    updatedPlatforms: readonly ProjectUsagePlatform[]
}

export interface UsageCleaningPlatformStartStats {
    discoveredFiles: number
}

export interface UsageCleaningPlatformParseStats {
    durationMs: number
    parsedFiles: number
}

export interface UsageCleaningPlatformFinishStats {
    durationMs: number
    interactions: number
    newInteractions: number
    newSessions: number
    sessions: number
    updatedSessionIds: string[]
    updatedSessions: number
}

export interface UsageCleaningCacheWriteStats {
    agentCount: number
    projectCount: number
    projectDetailsRemovedCount: number
    projectDetailsWriteCount: number
    sessionCount: number
    sourceFileCount: number
    updatedSessions: UpdatedUsageSession[]
}

export interface UsageCleaningCachePhaseStats {
    durationMs: number
}

export interface UsageCleaningCacheProjectDetailStats {
    durationMs: number
    label: string
    total: number
    written: number
}

export interface UsageCleaningCacheProjectDetailsStats {
    durationMs: number
    removedCount: number
    writeCount: number
}

export interface UsageCleaningCompleteStats extends UsageCleaningCacheWriteStats {
    durationMs: number
    phaseDurations: UsageCleaningPhaseDurations
}

export interface UsageCleaningPhaseDurations {
    aggregateMs: number
    cacheWriteMs: number
    discoveryMs: number
    parseMs: number
}

export class UsageCleaningConsoleReporter implements UsageCleaningReporter {
    private agentUpdateSpinner: ReturnType<typeof spinner> | null = null
    private agentUpdateSpinnerMessage = ''
    private readonly persistDetails = process.env.USAGE_BOARD_STARTUP_PERSISTENT_LOGS === '1'
    private readonly animated = !this.persistDetails && !process.env.CI && process.env.TERM !== 'dumb'
    private cacheProgress: ReturnType<typeof progress> | null = null
    private discoveryProgress: ReturnType<typeof progress> | null = null
    private platformProgress: ReturnType<typeof progress> | null = null

    constructor(private readonly options: {
        verboseProgress?: boolean
    } = {}) {}

    start() {
        if (!this.options.verboseProgress) {
            return
        }

        if (this.animated) {
            this.discoveryProgress = progress({
                max: 2,
                style: 'block',
            })
            this.discoveryProgress.start('正在读取 AI Coding 会话记录...')
            return
        }

        log.step('正在读取 AI Coding 会话记录...')
    }

    discoveredFiles(stats: UsageCleaningScannedStats) {
        if (!this.options.verboseProgress) {
            return
        }

        this.discoveryProgress?.advance(1, `查找到 ${stats.discoveredFiles} 个会话记录文件`)
    }

    foundFiles(stats: UsageCleaningDiscoveryStats) {
        if (!this.options.verboseProgress) {
            if (stats.updatedPlatforms.length > 0) {
                log.info(`检测到更新的 agent：${stats.updatedPlatforms.map(platform => PROJECT_USAGE_PLATFORM_META[platform].label).join(' / ')}`)
            }

            return
        }

        const summary = `查找到 ${stats.discoveredFiles} 个会话记录文件`

        if (this.animated) {
            this.discoveryProgress?.advance(1, '完成 DB 对比')
            this.discoveryProgress?.stop(summary)
            this.discoveryProgress = null
        }
        else {
            log.info(`${summary}，${stats.cachedFiles} 个来自 DB`)
        }

        if (stats.updatedPlatforms.length > 0) {
            const message = `正在处理更新的 agent：${stats.updatedPlatforms.map(platform => PROJECT_USAGE_PLATFORM_META[platform].label).join(' / ')}`

            if (this.persistDetails) {
                this.agentUpdateSpinnerMessage = message
                this.agentUpdateSpinner = spinner()
                this.agentUpdateSpinner.start(message)
            }
            else {
                log.info(message)
            }
        }

        if (stats.removedFiles > 0) {
            log.info(`检测到 ${stats.removedFiles} 个已删除的历史会话文件，将同步更新 cache.sqlite`)
        }
        else if (stats.changedFiles === 0) {
            log.info(`cache.sqlite 已命中 ${stats.cachedFiles} 个会话记录文件，无需重新解析源文件`)
        }
    }

    startPlatform(platform: ProjectUsagePlatform) {
        if (!this.options.verboseProgress) {
            return
        }

        this.stopAgentUpdateSpinner()

        const label = PROJECT_USAGE_PLATFORM_META[platform].label

        if (this.animated) {
            this.platformProgress = progress({
                style: 'block',
                max: 3,
            })

            this.platformProgress.start(`${label} 数据清洗中`)
            this.platformProgress.advance(1, `${label} 正在分析新增会话与交互`)
            return
        }

        log.info(`${label} 数据清洗中：正在分析新增会话与交互`)
    }

    parsedPlatformFiles(platform: ProjectUsagePlatform, stats: UsageCleaningPlatformParseStats) {
        if (!this.options.verboseProgress) {
            return
        }

        const label = PROJECT_USAGE_PLATFORM_META[platform].label
        const message = `${label} 已完成 ${stats.parsedFiles} 个源文件解析，用时 ${formatDurationMs(stats.durationMs)}，正在比对增量`

        if (this.animated) {
            this.platformProgress?.advance(1, message)
            return
        }

        log.info(message)
    }

    finishPlatform(platform: ProjectUsagePlatform, stats: UsageCleaningPlatformFinishStats) {
        const label = PROJECT_USAGE_PLATFORM_META[platform].label
        const summary = formatPlatformDeltaSummary(stats)

        if (this.animated) {
            this.platformProgress?.advance(1, `${label} ${summary}`)
            this.platformProgress?.stop(`${label} 数据清洗完成`)
            this.platformProgress = null
            return
        }

        log.success(`${label} 数据清洗完成：${summary}`)
    }

    startCacheWrite(stats: UsageCleaningCacheWriteStats) {
        if (!this.options.verboseProgress) {
            return
        }

        const sessionSummary = formatUpdatedSessionSummary(stats.updatedSessions)
        const message = `cache.sqlite 写入中：${stats.sessionCount} 条会话记录，${stats.projectCount} 个项目${sessionSummary}`

        if (this.animated) {
            this.cacheProgress = progress({
                max: stats.projectDetailsWriteCount + 3,
                style: 'block',
            })
            this.cacheProgress.start(message)
            return
        }

        log.info(message)
    }

    finishCacheBootstrap(stats: UsageCleaningCachePhaseStats) {
        this.advanceCacheStep(`agent 汇总写入完成，用时 ${formatDurationMs(stats.durationMs)}`)
    }

    finishCacheProjectCatalog(stats: UsageCleaningCachePhaseStats) {
        this.advanceCacheStep(`项目索引写入完成，用时 ${formatDurationMs(stats.durationMs)}`)
    }

    finishCacheProjectDetail(stats: UsageCleaningCacheProjectDetailStats) {
        this.advanceCacheStep(`项目详情写入中 ${stats.written}/${stats.total}：${stats.label}，用时 ${formatDurationMs(stats.durationMs)}`)
    }

    finishCacheProjectDetails(stats: UsageCleaningCacheProjectDetailsStats) {
        this.advanceCacheStep(`项目详情写入完成：更新 ${stats.writeCount} 个，删除 ${stats.removedCount} 个，用时 ${formatDurationMs(stats.durationMs)}`)
    }

    finishCacheWrite(stats: UsageCleaningCacheWriteStats) {
        const message = `cache.sqlite 写入完成：${stats.sessionCount} 条会话记录，${stats.agentCount} 个 agent${formatUpdatedSessionSummary(stats.updatedSessions)}`

        if (this.animated) {
            this.cacheProgress?.stop(message)
            this.cacheProgress = null
            return
        }

        log.success(message)
    }

    complete(stats: UsageCleaningCompleteStats) {
        this.stopAgentUpdateSpinner()
        log.success(`数据清洗完成，用时 ${formatDurationMs(stats.durationMs)}（发现/对比 ${formatDurationMs(stats.phaseDurations.discoveryMs)}，解析 ${formatDurationMs(stats.phaseDurations.parseMs)}，聚合 ${formatDurationMs(stats.phaseDurations.aggregateMs)}，写库 ${formatDurationMs(stats.phaseDurations.cacheWriteMs)}）`)
    }

    fail(error: unknown) {
        this.stopAgentUpdateSpinner()
        log.error(`数据清洗失败：${formatErrorMessage(error)}`)
    }

    private advanceCacheStep(message: string) {
        if (!this.options.verboseProgress) {
            return
        }

        if (this.animated) {
            this.cacheProgress?.advance(1, message)
            return
        }

        log.info(message)
    }

    private stopAgentUpdateSpinner() {
        if (!this.agentUpdateSpinner) {
            return
        }

        this.agentUpdateSpinner.stop(this.agentUpdateSpinnerMessage)
        this.agentUpdateSpinner = null
        this.agentUpdateSpinnerMessage = ''
    }
}

function formatDurationMs(durationMs: number) {
    if (durationMs < 1000) {
        return `${durationMs}ms`
    }

    return `${(durationMs / 1000).toFixed(1)}s`
}

function formatErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}

function formatUpdatedSessionSummary(updatedSessions: UpdatedUsageSession[]) {
    if (updatedSessions.length === 0) {
        return ''
    }

    const limit = 5
    const labels = updatedSessions
        .slice(0, limit)
        .map(({ platform, sessionId }) => `${PROJECT_USAGE_PLATFORM_META[platform].label}:${sessionId}`)
    const remainingCount = updatedSessions.length - labels.length

    return remainingCount > 0
        ? `，session ids ${labels.join(', ')} 等 ${updatedSessions.length} 个`
        : `，session ids ${labels.join(', ')}`
}

function formatPlatformDeltaSummary(stats: UsageCleaningPlatformFinishStats) {
    const sessionSummary = formatSessionIds(stats.updatedSessionIds)

    return `新增 ${stats.newSessions} 个会话，新增 ${stats.newInteractions} 条交互，影响 ${stats.updatedSessions} 个 session${sessionSummary}，总用时 ${formatDurationMs(stats.durationMs)}`
}

function formatSessionIds(sessionIds: string[]) {
    if (sessionIds.length === 0) {
        return ''
    }

    const limit = 5
    const labels = sessionIds.slice(0, limit)
    const remainingCount = sessionIds.length - labels.length

    return remainingCount > 0
        ? `，session ids ${labels.join(', ')} 等 ${sessionIds.length} 个`
        : `，session ids ${labels.join(', ')}`
}
