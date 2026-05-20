import type { ProjectUsagePlatform } from '#shared/types/ai'
import type { IConfig } from '#shared/types/config'
import type { GeminiSessionFile, GeminiTokenSnapshot, ModelPricingResolver, RawUsage, SessionLogLine } from '#shared/types/platform'
import type { ProjectInteractionRole, ProjectInteractionUsage, ProjectSessionInteractionItem, ProjectSessionUsageItem } from '#shared/types/usage-dashboard'
import type { UsageCacheRepository } from '../repositories/sqlite/usage-cache.repository'
import type { IncrementalUsageIndexResult, IndexedUsageInteraction, IndexedUsageSessionFragment, IndexedUsageSourceFile } from '../types/usage-indexer'
import { existsSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
    CLAUDE_FALLBACK_MODEL,
    CLAUDE_MODEL_ALIASES,
    CODEX_FALLBACK_MODEL,
    CODEX_MODEL_ALIASES,
    GEMINI_FALLBACK_MODEL,
    GEMINI_FALLBACK_PRICING_TABLE,
    GEMINI_MODEL_ALIASES,
} from '#shared/platform/constant'
import { calculateUsageCostUSD, createLiteLLMPricingResolver } from '#shared/platform/pricing'
import {
    convertCodexRawUsage,
    convertGeminiTokenUsage,
    decodeClaudeProjectPath,
    extractClaudeProjectFromPath,
    extractGeminiMessageText,
    extractModelName,
    formatDuration,
    getClaudeLookupCandidates,
    getDurationMinutes,
    getGeminiLookupCandidates,
    getGeminiProjectKeyFromPath,
    getGeminiProjectRoot,
    getMonthKey,
    getProjectName,
    getRepositoryNameFromProjectRoot,
    getWeekLabel,
    isOpenRouterFreeModel,
    isZeroUsage,
    normalizeRawUsage,
    normalizeRepositoryUrl,
    parseJsonFile,
    parseJsonlFile,
    subtractRawUsage,
    toIsoString,
} from '#shared/utils/platform'
import { formatDateLabelFromDateKey, getDateKey, normalizeNumber, roundCurrency } from '#shared/utils/usage-dashboard'
import { glob } from 'glob'

interface DiscoveredUsageFile {
    mtimeMs: number
    path: string
    platform: ProjectUsagePlatform
    size: number
}

interface PricingResolvers {
    claudeCode: ModelPricingResolver
    codex: ModelPricingResolver
    gemini: ModelPricingResolver
}

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
    const [
        claudeCode,
        codex,
        gemini,
    ] = await Promise.all([
        createLiteLLMPricingResolver({
            aliases: CLAUDE_MODEL_ALIASES,
            fallbackModel: CLAUDE_FALLBACK_MODEL,
            getLookupCandidates: getClaudeLookupCandidates,
        }),
        createLiteLLMPricingResolver({
            aliases: CODEX_MODEL_ALIASES,
            fallbackModel: CODEX_FALLBACK_MODEL,
            isZeroCostModel: isOpenRouterFreeModel,
        }),
        createLiteLLMPricingResolver({
            aliases: GEMINI_MODEL_ALIASES,
            fallbackModel: GEMINI_FALLBACK_MODEL,
            fallbackPricingTable: GEMINI_FALLBACK_PRICING_TABLE,
            getLookupCandidates: getGeminiLookupCandidates,
        }),
    ])

    return {
        claudeCode,
        codex,
        gemini,
    }
}

async function discoverUsageFiles(config: IConfig) {
    const [claudeFiles, codexFiles, geminiFiles] = await Promise.all([
        discoverClaudeUsageFiles(config),
        discoverCodexUsageFiles(config),
        discoverGeminiUsageFiles(config),
    ])

    return [...claudeFiles, ...codexFiles, ...geminiFiles]
        .sort((a, b) => a.path.localeCompare(b.path))
}

async function discoverClaudeUsageFiles(config: IConfig) {
    const claudePaths = config.claudeCodePaths?.length ? config.claudeCodePaths : [config.claudeCodePath]
    const fileGroups = await Promise.all(claudePaths.map(async (claudePath) => {
        const projectsDir = `${claudePath}/projects`

        if (!existsSync(projectsDir)) {
            return [] as string[]
        }

        return glob(`${projectsDir}/**/*.jsonl`, {
            absolute: true,
        }).catch(() => [])
    }))

    return fileGroups
        .flat()
        .flatMap(filePath => toDiscoveredUsageFile(filePath, 'claudeCode'))
}

async function discoverCodexUsageFiles(config: IConfig) {
    const sessionsDir = join(config.codexPath, 'sessions')

    if (!existsSync(sessionsDir)) {
        return []
    }

    const files = await glob('**/*.jsonl', {
        absolute: true,
        cwd: sessionsDir,
    })

    return files.flatMap(filePath => toDiscoveredUsageFile(filePath, 'codex'))
}

async function discoverGeminiUsageFiles(config: IConfig) {
    const tmpDir = `${config.geminiPath}/tmp`

    if (!existsSync(tmpDir)) {
        return []
    }

    const fileGroups = await Promise.all([
        glob(`${tmpDir}/*/chats/session-*.json`, { absolute: true }),
        glob(`${tmpDir}/*/chats/sessions-*.json`, { absolute: true }),
    ])
    const files = Array.from(new Set(fileGroups.flat())).sort((a, b) => a.localeCompare(b))

    return files.flatMap(filePath => toDiscoveredUsageFile(filePath, 'gemini'))
}

function toDiscoveredUsageFile(filePath: string, platform: ProjectUsagePlatform) {
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

function parseUsageFile(
    file: DiscoveredUsageFile,
    pricingResolvers: PricingResolvers,
): IndexedUsageSourceFile {
    const payload = file.platform === 'claudeCode'
        ? parseClaudeUsageFile(file.path, pricingResolvers.claudeCode)
        : file.platform === 'codex'
            ? parseCodexUsageFile(file.path, pricingResolvers.codex)
            : parseGeminiUsageFile(file.path, pricingResolvers.gemini)

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
    return {
        claudeCode: buildPlatformSessionsFromFiles(indexedFiles, 'claudeCode'),
        codex: buildPlatformSessionsFromFiles(indexedFiles, 'codex'),
        gemini: buildPlatformSessionsFromFiles(indexedFiles, 'gemini'),
    } satisfies Record<ProjectUsagePlatform, ProjectSessionUsageItem[]>
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

function parseClaudeUsageFile(filePath: string, resolvePricing: ModelPricingResolver) {
    const projectPath = extractClaudeProjectFromPath(filePath)
    const fallbackSessionId = basename(filePath, '.jsonl')
    const lines = parseJsonlFile<Record<string, unknown>>(filePath)
    const fragments = new Map<string, IndexedUsageSessionFragment>()

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]!
        const sessionId = getString(line.sessionId) || fallbackSessionId
        const cwd = getString(line.cwd)
        const project = getProjectName(cwd, '') || decodeClaudeProjectPath(projectPath)
        const timestamp = toIsoString(line.timestamp) ?? null
        const message = getRecord(line.message)
        const usageRecord = getRecord(message?.usage)
        const model = getClaudeDisplayModel(line)
        const usage = usageRecord
            ? getClaudeInteractionUsage(usageRecord, model, resolvePricing, line)
            : null
        const key = getSessionLookupKey(project, sessionId)
        const fragment = fragments.get(key) ?? createSessionFragment({
            project,
            repository: `local/${project}`,
            sessionId,
            startedAt: timestamp,
            threadName: `Session for ${project}`,
        })

        addFragmentInteraction(fragment, {
            content: extractClaudeMessageText(message?.content),
            costUSD: usage?.costUSD ?? 0,
            dedupeKey: getClaudeUniqueHash(line),
            index,
            model: model ?? null,
            role: getInteractionRole(line, message),
            timestamp,
            type: getString(line.type) || getString(message?.type) || 'message',
            usage,
        })
        fragments.set(key, fragment)
    }

    return Array.from(fragments.values())
}

function parseCodexUsageFile(filePath: string, resolvePricing: ModelPricingResolver) {
    const lines = parseJsonlFile<SessionLogLine>(filePath)
    const sessionMeta = lines.find(line => line.type === 'session_meta')?.payload
    const sessionId = getSessionId(filePath, getString(sessionMeta?.id))
    const startedAt = toIsoString(sessionMeta?.timestamp) ?? toIsoString(lines[0]?.timestamp)
    const project = getProjectName(getString(sessionMeta?.cwd))
    const repository = normalizeRepositoryUrl(sessionMeta?.git?.repository_url) || `local/${project}`
    const fragment = createSessionFragment({
        project,
        repository,
        sessionId,
        startedAt,
        threadName: `Session for ${project}`,
    })
    let previousTotals: RawUsage | null = null
    let currentModel: string | undefined
    let currentModelIsFallback = false

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]!

        if (line.type === 'turn_context') {
            const contextModel = extractModelName(line.payload)

            if (contextModel) {
                currentModel = contextModel
                currentModelIsFallback = false
            }
        }

        const timestamp = toIsoString(line.timestamp) ?? toIsoString(line.payload?.timestamp)
        const extractedModel = extractModelName(line.payload)

        if (extractedModel) {
            currentModel = extractedModel
            currentModelIsFallback = false
        }

        const rawUsage = getCodexRawUsage(line, previousTotals)
        const totalUsage = normalizeRawUsage(line.payload?.info?.total_token_usage)

        if (totalUsage) {
            previousTotals = totalUsage
        }

        let model = extractedModel ?? currentModel
        let isFallbackModel = false

        if (!model && rawUsage) {
            model = CODEX_FALLBACK_MODEL
            isFallbackModel = true
            currentModel = model
            currentModelIsFallback = true
        }
        else if (!extractedModel && currentModelIsFallback) {
            isFallbackModel = true
        }

        const usage = rawUsage
            ? getCodexInteractionUsage(rawUsage, model ?? CODEX_FALLBACK_MODEL, resolvePricing)
            : null

        addFragmentInteraction(fragment, {
            content: extractCodexContent(line),
            costUSD: usage?.costUSD ?? 0,
            index,
            model: model ?? null,
            role: getCodexRole(line),
            timestamp,
            type: line.payload?.type ?? line.type ?? 'event',
            usage: usage ? { ...usage, isFallbackModel } : null,
        })
    }

    return [fragment]
}

function parseGeminiUsageFile(filePath: string, resolvePricing: ModelPricingResolver) {
    const data = parseJsonFile(filePath)

    if (!isGeminiSessionFile(data)) {
        return [] as IndexedUsageSessionFragment[]
    }

    const startedAt = toIsoString(data.startTime)
        ?? data.messages.map(message => toIsoString(message.timestamp)).find(Boolean)
        ?? null
    const lastTimestamp = toIsoString(data.lastUpdated)
        ?? [...data.messages].reverse().map(message => toIsoString(message.timestamp)).find(Boolean)
        ?? null
    const projectRoot = getGeminiProjectRoot(filePath)
    const project = getProjectName(projectRoot, '') || getGeminiProjectKeyFromPath(filePath)
    const repository = getRepositoryNameFromProjectRoot(projectRoot) || `local/${project}`
    const sessionId = data.sessionId?.trim() || basename(filePath, '.json')
    const fragment = createSessionFragment({
        project,
        repository,
        sessionId,
        startedAt,
        threadName: getGeminiThreadName(data, project),
    })
    fragment.durationEndAt = lastTimestamp ?? ''

    for (let index = 0; index < data.messages.length; index += 1) {
        const message = data.messages[index]!
        const timestamp = toIsoString(message.timestamp)
        const model = message.model?.trim() || (message.tokens ? GEMINI_FALLBACK_MODEL : null)
        const usage = message.tokens && model
            ? getGeminiInteractionUsage(message.tokens, model, resolvePricing)
            : null

        addFragmentInteraction(fragment, {
            content: extractGeminiMessageText(message.content),
            costUSD: usage?.costUSD ?? 0,
            index,
            model,
            role: getGeminiRole(message),
            timestamp,
            type: message.type ?? 'message',
            usage,
        })
    }

    return [fragment]
}

function createSessionFragment(options: {
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

function addFragmentInteraction(fragment: IndexedUsageSessionFragment, interaction: IndexedUsageInteraction) {
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
    const dateKey = Number.isFinite(startedAtDate.getTime()) ? getDateKey(startedAtDate) : ''

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
        month: Number.isFinite(startedAtDate.getTime()) ? getMonthKey(startedAtDate) : '',
        outputTokens: detail.outputTokens,
        project: detail.project,
        reasoningOutputTokens: detail.reasoningOutputTokens,
        repository: detail.repository,
        sessionId: detail.sessionId,
        startedAt,
        topModel: detail.topModel,
        threadName: detail.threadName,
        tokenTotal: detail.tokenTotal,
        week: Number.isFinite(startedAtDate.getTime()) ? getWeekLabel(startedAtDate) : '',
    }
}

function getValidTimestamp(value: string) {
    return Number.isFinite(Date.parse(value)) ? value : null
}

function getClaudeInteractionUsage(
    usage: Record<string, unknown>,
    model: string | undefined,
    resolvePricing: ModelPricingResolver,
    line: Record<string, unknown>,
): ProjectInteractionUsage {
    const cacheCreationTokens = normalizeNumber(usage.cache_creation_input_tokens)
    const cacheReadTokens = normalizeNumber(usage.cache_read_input_tokens)
    const inputTokens = normalizeNumber(usage.input_tokens)
    const outputTokens = normalizeNumber(usage.output_tokens)
    const costUSD = normalizeOptionalNumber(line.costUSD) ?? (model
        ? calculateUsageCostUSD({
                cacheCreationTokens,
                cachedInputTokens: cacheReadTokens,
                inputTokens,
                outputTokens,
            }, resolvePricing(model), {
                speed: usage.speed === 'fast' ? 'fast' : undefined,
            })
        : 0)

    return {
        cacheCreationTokens,
        cacheReadTokens,
        cachedInputTokens: cacheCreationTokens + cacheReadTokens,
        costUSD,
        inputTokens,
        outputTokens,
        reasoningOutputTokens: 0,
        totalTokens: inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens,
    }
}

function getCodexRawUsage(line: SessionLogLine, previousTotals: RawUsage | null) {
    if (line.type !== 'event_msg' || line.payload?.type !== 'token_count') {
        return null
    }

    const info = line.payload.info
    const lastUsage = normalizeRawUsage(info?.last_token_usage)
    const totalUsage = normalizeRawUsage(info?.total_token_usage)

    return lastUsage ?? (totalUsage ? subtractRawUsage(totalUsage, previousTotals) : null)
}

function getCodexInteractionUsage(
    rawUsage: RawUsage,
    model: string,
    resolvePricing: ModelPricingResolver,
): ProjectInteractionUsage | null {
    const usage = convertCodexRawUsage(rawUsage)

    if (isZeroUsage(usage)) {
        return null
    }

    return {
        ...usage,
        costUSD: calculateUsageCostUSD(usage, resolvePricing(model)),
    }
}

function getGeminiInteractionUsage(
    tokens: GeminiTokenSnapshot,
    model: string,
    resolvePricing: ModelPricingResolver,
): ProjectInteractionUsage | null {
    const usage = convertGeminiTokenUsage(tokens)

    if (isZeroUsage(usage)) {
        return null
    }

    const toolTokens = normalizeNumber(tokens.tool)
    const costUSD = calculateUsageCostUSD({
        cachedInputTokens: usage.cachedInputTokens,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens + usage.reasoningOutputTokens + toolTokens,
    }, resolvePricing(model))

    return {
        ...usage,
        costUSD,
        toolTokens,
    }
}

function getClaudeDisplayModel(line: Record<string, unknown>) {
    const message = getRecord(line.message)
    const model = getString(message?.model)
    const usage = getRecord(message?.usage)

    if (!model) {
        return undefined
    }

    return usage?.speed === 'fast' ? `${model}-fast` : model
}

function getClaudeUniqueHash(line: Record<string, unknown>) {
    const message = getRecord(line.message)
    const messageId = getString(message?.id)
    const requestId = getString(line.requestId)

    return messageId && requestId ? `${messageId}:${requestId}` : null
}

function extractClaudeMessageText(content: unknown) {
    if (typeof content === 'string') {
        return content
    }

    if (!Array.isArray(content)) {
        return ''
    }

    return content
        .map(item => typeof item === 'object' && item ? getString((item as Record<string, unknown>).text) : '')
        .filter(Boolean)
        .join('\n')
}

function extractCodexContent(line: SessionLogLine) {
    const payload = line.payload

    if (!payload) {
        return ''
    }

    const message = payload.message

    if (typeof message === 'string') {
        return message
    }

    return getString(payload.text) || getString(payload.output) || getString(payload.content)
}

function getInteractionRole(line: Record<string, unknown>, message: Record<string, unknown> | null): ProjectInteractionRole {
    const role = getString(line.type) || getString(message?.role) || getString(message?.type)

    return normalizeRole(role)
}

function getCodexRole(line: SessionLogLine): ProjectInteractionRole {
    const type = line.payload?.type ?? line.type ?? ''

    if (type === 'token_count') {
        return 'usage'
    }

    return normalizeRole(type)
}

function getGeminiRole(message: GeminiSessionFile['messages'][number]): ProjectInteractionRole {
    if (message.type === 'gemini') {
        return 'assistant'
    }

    return normalizeRole(message.type ?? '')
}

function normalizeRole(value: string): ProjectInteractionRole {
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

function getSessionId(filePath: string, sessionMetaId: string | undefined) {
    return sessionMetaId?.trim() || basename(filePath, '.jsonl')
}

function isGeminiSessionFile(value: unknown): value is GeminiSessionFile {
    if (!value || typeof value !== 'object') {
        return false
    }

    return Array.isArray((value as Record<string, unknown>).messages)
}

function getGeminiThreadName(data: GeminiSessionFile, project: string) {
    const firstUserMessage = data.messages
        .filter(message => message.type === 'user')
        .map(message => extractGeminiMessageText(message.content))
        .find(Boolean)
    const summary = data.summary?.trim()
    const name = firstUserMessage || summary

    if (!name) {
        return `Session for ${project}`
    }

    return name.length > 96 ? `${name.slice(0, 93)}...` : name
}

function getSessionLookupKey(project: string, sessionId: string) {
    return `${project}:${sessionId}`
}

function getRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function getString(value: unknown) {
    return typeof value === 'string' ? value.trim() : ''
}

function normalizeOptionalNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}
