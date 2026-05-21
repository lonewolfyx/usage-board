import type { UsageCacheRepository } from '#server/repositories/sqlite/usage-cache.repository'
import type { DiscoveredUsageFile, PricingResolvers } from '#server/services/usage-indexer/platform-adapter'
import type {
    IncrementalUsageIndexResult,
    IndexedUsageInteraction,
    IndexedUsageSessionFragment,
    IndexedUsageSourceFile,
} from '#server/types/usage-indexer'
import type { ProjectUsagePlatform, ProjectUsagePlatformRecord } from '#shared/types/ai'
import type { IConfig } from '#shared/types/config'
import type { ProjectSessionInteractionItem, ProjectSessionUsageItem } from '#shared/types/usage-dashboard'
import { usagePlatformAdapters } from '#server/services/usage-indexer/adapters'
import { getValidTimestamp } from '#server/services/usage-indexer/session-fragment'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'
import {
    formatDuration,
    getDurationMinutes,
    getMonthKey,
    getWeekLabel,
} from '#shared/utils/platform'
import { formatDateLabelFromDateKey, getDateKey, roundCurrency } from '#shared/utils/usage-dashboard'

interface MutableSessionDetail {
    cachedInputTokens: number
    costUSD: number
    durationEndAt: string
    durationMinutes: number
    inputTokens: number
    interactions: IndexedUsageInteraction[]
    lastActivity: string
    modelTotals: Map<string, number>
    models: string[]
    outputTokens: number
    project: string
    reasoningOutputTokens: number
    repository: string
    sessionId: string
    startedAt: string
    threadName: string
    tokenTotal: number
    topModel: string
}

export async function buildIncrementalUsageIndex(
    config: IConfig,
    repository: UsageCacheRepository,
): Promise<IncrementalUsageIndexResult> {
    const discoveredFiles = await discoverUsageFiles(config)
    const cachedFiles = repository.loadIndexedSourceFiles()
    const cachedFilesByPath = new Map(cachedFiles.map(file => [file.path, file]))
    const changedFiles = discoveredFiles.filter((file) => {
        const cached = cachedFilesByPath.get(file.path)

        return !cached
            || cached.platform !== file.platform
            || cached.size !== file.size
            || cached.mtimeMs !== file.mtimeMs
    })
    const removedFiles = cachedFiles.filter(file => !discoveredFiles.some(discovered => discovered.path === file.path))
    const affectedProjects = new Set<string>(removedFiles.flatMap(file => file.projectNames))

    if (changedFiles.length === 0 && removedFiles.length === 0) {
        const indexedFiles = cachedFiles.sort((a, b) => a.path.localeCompare(b.path))

        return {
            affectedProjects: [],
            bootstrapByPlatform: buildPlatformSessionsByPlatform(indexedFiles),
            indexedFiles,
            removedProjects: [],
        }
    }

    const pricingResolvers = await createPricingResolvers()
    const parsedChangedFiles = await Promise.all(changedFiles.map(file => parseUsageFile(file, pricingResolvers)))

    for (const file of changedFiles) {
        const cached = cachedFilesByPath.get(file.path)

        if (cached) {
            for (const projectName of cached.projectNames) {
                affectedProjects.add(projectName)
            }
        }
    }

    for (const file of parsedChangedFiles) {
        for (const projectName of file.projectNames) {
            affectedProjects.add(projectName)
        }
    }

    const parsedByPath = new Map(parsedChangedFiles.map(file => [file.path, file]))
    const indexedFiles = discoveredFiles
        .map((file) => {
            const changed = parsedByPath.get(file.path)

            if (changed) {
                return changed
            }

            return cachedFilesByPath.get(file.path) ?? null
        })
        .filter((file): file is IndexedUsageSourceFile => file !== null)
        .sort((a, b) => a.path.localeCompare(b.path))

    repository.deleteIndexedSourceFiles(removedFiles.map(file => file.path))
    repository.upsertIndexedSourceFiles(parsedChangedFiles)

    const bootstrapByPlatform = buildPlatformSessionsByPlatform(indexedFiles)
    const currentProjectNames = new Set(
        Object.values(bootstrapByPlatform).flatMap(sessions => sessions.map(session => session.project)),
    )
    const removedProjects = Array.from(affectedProjects).filter(projectName => !currentProjectNames.has(projectName))

    return {
        affectedProjects: Array.from(affectedProjects).sort((a, b) => a.localeCompare(b)),
        bootstrapByPlatform,
        indexedFiles,
        removedProjects,
    }
}

async function createPricingResolvers(): Promise<PricingResolvers> {
    const entries = await Promise.all(PROJECT_USAGE_PLATFORMS.map(async platform => [
        platform,
        await usagePlatformAdapters[platform].createPricingResolver(),
    ] as const))

    return Object.fromEntries(entries) as PricingResolvers
}

async function discoverUsageFiles(config: IConfig) {
    const fileGroups = await Promise.all(PROJECT_USAGE_PLATFORMS.map(platform => usagePlatformAdapters[platform].discoverFiles(config)))

    return fileGroups
        .flat()
        .sort((a, b) => a.path.localeCompare(b.path))
}

function parseUsageFile(
    file: DiscoveredUsageFile,
    pricingResolvers: PricingResolvers,
): IndexedUsageSourceFile {
    const adapter = usagePlatformAdapters[file.platform]
    const payload = adapter.parseFile(file.path, pricingResolvers[file.platform])

    return {
        mtimeMs: file.mtimeMs,
        path: file.path,
        payload,
        platform: file.platform,
        projectNames: Array.from(new Set(payload.map(fragment => fragment.project))).sort((a, b) => a.localeCompare(b)),
        size: file.size,
        updatedAt: new Date().toISOString(),
    }
}

function buildPlatformSessionsByPlatform(indexedFiles: IndexedUsageSourceFile[]) {
    return Object.fromEntries(
        PROJECT_USAGE_PLATFORMS.map(platform => [platform, buildPlatformSessionsFromFiles(indexedFiles, platform)]),
    ) as ProjectUsagePlatformRecord<ProjectSessionUsageItem[]>
}

function buildPlatformSessionsFromFiles(
    indexedFiles: IndexedUsageSourceFile[],
    platform: ProjectUsagePlatform,
) {
    const details = new Map<string, MutableSessionDetail>()
    const seenDedupeKeys = new Set<string>()

    for (const file of indexedFiles) {
        if (file.platform !== platform) {
            continue
        }

        for (const fragment of file.payload) {
            const detail = details.get(fragment.key) ?? createSessionDetail(fragment)

            if (fragment.durationEndAt && (!detail.durationEndAt || Date.parse(fragment.durationEndAt) > Date.parse(detail.durationEndAt))) {
                detail.durationEndAt = fragment.durationEndAt
            }

            for (const interaction of fragment.interactions) {
                if (interaction.dedupeKey) {
                    if (seenDedupeKeys.has(interaction.dedupeKey)) {
                        continue
                    }

                    seenDedupeKeys.add(interaction.dedupeKey)
                }

                addInteraction(detail, interaction)
            }

            details.set(fragment.key, detail)
        }
    }

    return Array.from(details.values())
        .map(finalizeSessionDetail)
        .filter(hasBillableSessionDetail)
        .map(toProjectSessionUsageItem)
        .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
}

function createSessionDetail(fragment: IndexedUsageSessionFragment): MutableSessionDetail {
    return {
        cachedInputTokens: 0,
        costUSD: 0,
        durationEndAt: fragment.durationEndAt,
        durationMinutes: 0,
        inputTokens: 0,
        interactions: [],
        lastActivity: fragment.startedAt ?? '',
        modelTotals: new Map<string, number>(),
        models: [],
        outputTokens: 0,
        project: fragment.project,
        reasoningOutputTokens: 0,
        repository: fragment.repository,
        sessionId: fragment.sessionId,
        startedAt: fragment.startedAt ?? '',
        threadName: fragment.threadName,
        tokenTotal: 0,
        topModel: 'unknown',
    }
}

function addInteraction(detail: MutableSessionDetail, interaction: IndexedUsageInteraction) {
    detail.interactions.push(interaction)

    if (interaction.timestamp) {
        if (!detail.startedAt || Date.parse(interaction.timestamp) < Date.parse(detail.startedAt)) {
            detail.startedAt = interaction.timestamp
        }

        if (!detail.lastActivity || Date.parse(interaction.timestamp) > Date.parse(detail.lastActivity)) {
            detail.lastActivity = interaction.timestamp
        }
    }

    if (!interaction.usage) {
        return
    }

    detail.inputTokens += interaction.usage.inputTokens
    detail.cachedInputTokens += interaction.usage.cachedInputTokens
    detail.outputTokens += interaction.usage.outputTokens
    detail.reasoningOutputTokens += interaction.usage.reasoningOutputTokens
    detail.tokenTotal += interaction.usage.totalTokens
    detail.costUSD += interaction.usage.costUSD

    if (interaction.model) {
        detail.models = Array.from(new Set([...detail.models, interaction.model]))
        detail.modelTotals.set(
            interaction.model,
            (detail.modelTotals.get(interaction.model) ?? 0) + interaction.usage.totalTokens,
        )
    }
}

function finalizeSessionDetail(detail: MutableSessionDetail) {
    detail.costUSD = roundCurrency(detail.costUSD)
    detail.durationMinutes = getDurationMinutes(detail.startedAt, detail.durationEndAt || detail.lastActivity)
    detail.interactions = detail.interactions.sort((a, b) => {
        if (a.timestamp && b.timestamp) {
            return Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.index - b.index
        }

        return a.index - b.index
    })
    detail.topModel = Array.from(detail.modelTotals.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'unknown'
    detail.models = detail.models.sort((a, b) => a.localeCompare(b))

    return detail
}

function hasBillableSessionDetail(detail: MutableSessionDetail) {
    return detail.tokenTotal > 0 || detail.costUSD > 0
}

function toProjectSessionUsageItem(detail: MutableSessionDetail): ProjectSessionUsageItem {
    const startedAt = getValidTimestamp(detail.startedAt) ?? getValidTimestamp(detail.lastActivity) ?? new Date(0).toISOString()
    const lastActivity = getValidTimestamp(detail.lastActivity) ?? startedAt
    const startedAtDate = new Date(startedAt)
    const hasValidStartedAtDate = Number.isFinite(startedAtDate.getTime())
    const dateKey = hasValidStartedAtDate ? getDateKey(startedAtDate) : ''

    return {
        cachedInputTokens: detail.cachedInputTokens,
        costUSD: detail.costUSD,
        date: dateKey ? formatDateLabelFromDateKey(dateKey) : '',
        duration: formatDuration(detail.durationMinutes),
        durationMinutes: detail.durationMinutes,
        id: detail.sessionId,
        inputTokens: detail.inputTokens,
        interactions: detail.interactions.map(({ dedupeKey: _dedupeKey, ...interaction }) => ({
            ...interaction,
            raw: null,
        })) as ProjectSessionInteractionItem[],
        lastActivity,
        model: detail.topModel,
        models: detail.models,
        month: hasValidStartedAtDate ? getMonthKey(startedAtDate) : '',
        outputTokens: detail.outputTokens,
        project: detail.project,
        reasoningOutputTokens: detail.reasoningOutputTokens,
        repository: detail.repository,
        sessionId: detail.sessionId,
        startedAt,
        topModel: detail.topModel,
        threadName: detail.threadName,
        tokenTotal: detail.tokenTotal,
        week: hasValidStartedAtDate ? getWeekLabel(startedAtDate) : '',
    }
}
