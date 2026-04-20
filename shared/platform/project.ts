import type { ProjectUsagePlatform } from '#shared/types/ai'
import type { IConfig } from '#shared/types/config'
import type {
    GeminiSessionFile,
    GeminiTokenSnapshot,
    ModelPricingResolver,
    RawUsage,
    SessionLogLine,
    UsageAggregateEvent,
} from '#shared/types/platform'
import type {
    LoadProjectsUsageResult,
    LoadUsageResult,
    ProjectInteractionRole,
    ProjectInteractionUsage,
    ProjectPlatformUsage,
    ProjectSessionInteractionItem,
    ProjectSessionUsageItem,
    ProjectUsageAnalyzing,
} from '#shared/types/usage-dashboard'
import { existsSync } from 'node:fs'
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
    buildDailyRows,
    buildDailyTokenUsage,
    buildDailyUsageGroups,
    buildMonthlyModelUsage,
    buildOverviewCards,
    buildPeriodRows,
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
    getTopModelForDate,
    getTopProjectForDate,
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
import {
    buildProjectUsage,
    formatDateLabelFromDateKey,
    getDateKey,
    getPreviousDateKey,
    normalizeNumber,
    roundCurrency,
} from '#shared/utils/usage-dashboard'
import { glob } from 'glob'

/**
 * Loads Claude Code, Codex, and Gemini usage, then groups all sessions by project.
 *
 * @example
 * ```ts
 * const projects = await loadProjectsUsage(config)
 * console.log(projects[0]?.['usage-board']?.analyzing.codex.sessions[0]?.interactions)
 * ```
 */
export async function loadProjectsUsage(config: IConfig): Promise<LoadProjectsUsageResult> {
    const [
        claudeResolvePricing,
        codexResolvePricing,
        geminiResolvePricing,
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
    const [
        claudeDetails,
        codexDetails,
        geminiDetails,
    ] = await Promise.all([
        loadClaudeSessionDetails(config, claudeResolvePricing),
        loadCodexSessionDetails(config, codexResolvePricing),
        loadGeminiSessionDetails(config, geminiResolvePricing),
    ])
    const platformProjects = {
        claudeCode: getPlatformProjectNames(claudeDetails),
        codex: getPlatformProjectNames(codexDetails),
        gemini: getPlatformProjectNames(geminiDetails),
    } satisfies Record<ProjectUsagePlatform, string[]>

    const projectNames = uniqueItems([
        ...platformProjects.claudeCode,
        ...platformProjects.codex,
        ...platformProjects.gemini,
    ]).sort((a, b) => a.localeCompare(b))

    return projectNames.map((projectName) => {
        const analyzing: ProjectUsageAnalyzing = {
            claudeCode: buildPlatformProjectUsage(claudeDetails, projectName),
            codex: buildPlatformProjectUsage(codexDetails, projectName),
            gemini: buildPlatformProjectUsage(geminiDetails, projectName),
        }
        const sessions = [
            ...analyzing.claudeCode.sessions,
            ...analyzing.codex.sessions,
            ...analyzing.gemini.sessions,
        ]

        return {
            [projectName]: {
                label: projectName,
                models: collectSessionModels(sessions),
                createTime: getEarliestStartedAt(sessions),
                sessionCound: sessions.length,
                analyzing,
            },
        }
    })
}

function getPlatformProjectNames(detailsBySession: Map<string, ProjectSessionDetail>) {
    return uniqueItems(Array.from(detailsBySession.values()).map(detail => detail.project))
        .sort((a, b) => a.localeCompare(b))
}

function buildPlatformProjectUsage(
    detailsBySession: Map<string, ProjectSessionDetail>,
    projectName: string,
): ProjectPlatformUsage {
    const sessions = getProjectSessions(detailsBySession, projectName)

    return {
        ...buildProjectLoadUsageResult(sessions, projectName),
        sessions,
    }
}

function getProjectSessions(
    detailsBySession: Map<string, ProjectSessionDetail>,
    projectName: string,
) {
    return Array.from(detailsBySession.values())
        .filter(detail => detail.project === projectName)
        .map(detail => createSessionFromDetail(detail))
        .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
}

function buildProjectLoadUsageResult(sessions: ProjectSessionUsageItem[], projectName: string): LoadUsageResult {
    const events = getProjectAggregateEvents(sessions, projectName)
    const dailyGroups = buildDailyUsageGroups(events)
    const todayDateKey = getDateKey(new Date())
    const previousDayDateKey = getPreviousDateKey(todayDateKey)
    const todayDailyGroup = dailyGroups.get(todayDateKey)
    const previousDayDailyGroup = dailyGroups.get(previousDayDateKey)
    const todayDailyGroups = todayDailyGroup
        ? new Map([[todayDateKey, todayDailyGroup]])
        : new Map()
    const todayEvents = events.filter(event => getDateKey(new Date(event.timestamp)) === todayDateKey)
    const todayTotalTokens = todayDailyGroup?.totalTokens ?? 0
    const todayTotalCost = roundCurrency(todayDailyGroup?.costUSD ?? 0)
    const todayTopProject = getTopProjectForDate(todayEvents)
    const todayTopModel = getTopModelForDate(todayEvents)

    return {
        dailyRows: buildDailyRows(todayDailyGroups),
        dailyTokenUsage: buildDailyTokenUsage(dailyGroups),
        monthlyModelUsage: buildMonthlyModelUsage(events),
        monthlyRows: buildPeriodRows(events, 'month'),
        overviewCards: buildOverviewCards({
            previousDayCost: roundCurrency(previousDayDailyGroup?.costUSD ?? 0),
            previousDayTokens: previousDayDailyGroup?.totalTokens ?? 0,
            todayTopModel,
            todayTopProject,
            todayTotalCost,
            todayTotalTokens,
        }),
        projectUsage: buildProjectUsage(sessions),
        sessionRows: buildProjectSessionRows(sessions, projectName),
        sessionUsage: sessions,
        todayTopModel,
        todayTopProject: todayTopProject?.project === projectName ? todayTopProject : null,
        todayTotalCost,
        todayTotalTokens,
        weeklyRows: buildPeriodRows(events, 'week'),
    }
}

interface ProjectAggregateEvent extends UsageAggregateEvent {
    costUSD: number
}

function getProjectAggregateEvents(sessions: ProjectSessionUsageItem[], projectName: string): ProjectAggregateEvent[] {
    return sessions
        .flatMap(session => session.interactions
            .filter(interaction => interaction.usage && interaction.timestamp && hasBillableUsage(interaction.usage))
            .map((interaction): ProjectAggregateEvent => ({
                cachedInputTokens: interaction.usage!.cachedInputTokens,
                costUSD: interaction.usage!.costUSD,
                inputTokens: interaction.usage!.inputTokens,
                isFallbackModel: interaction.usage!.isFallbackModel ?? false,
                model: interaction.model ?? session.model,
                outputTokens: interaction.usage!.outputTokens,
                project: projectName,
                reasoningOutputTokens: interaction.usage!.reasoningOutputTokens,
                repository: session.repository,
                sessionId: session.sessionId,
                timestamp: interaction.timestamp!,
                totalTokens: interaction.usage!.totalTokens,
            })))
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
}

function hasBillableUsage(usage: ProjectInteractionUsage) {
    return usage.totalTokens > 0 || usage.costUSD > 0
}

function buildProjectSessionRows(sessions: ProjectSessionUsageItem[], projectName: string) {
    return sessions
        .map(session => ({
            cachedInputTokens: session.cachedInputTokens,
            costUSD: session.costUSD,
            id: session.sessionId,
            inputTokens: session.inputTokens,
            label: session.sessionId,
            models: session.models,
            outputTokens: session.outputTokens,
            period: getSessionDateLabel(session.startedAt),
            projects: [projectName],
            reasoningOutputTokens: session.reasoningOutputTokens,
            sessionCount: 1,
            totalTokens: session.tokenTotal,
        }))
}

interface ProjectSessionDetail {
    durationMinutes: number
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    reasoningOutputTokens: number
    tokenTotal: number
    costUSD: number
    interactions: ProjectSessionInteractionItem[]
    lastActivity: string
    models: string[]
    project: string
    repository: string
    sessionId: string
    startedAt: string
    threadName: string
}

async function loadClaudeSessionDetails(config: IConfig, resolvePricing: ModelPricingResolver) {
    const details = new Map<string, ProjectSessionDetail>()
    const files = await globClaudeUsageFiles(config)
    const processedHashes = new Set<string>()

    for (const filePath of files.sort((a, b) => a.localeCompare(b))) {
        const projectPath = extractClaudeProjectFromPath(filePath)
        const fallbackSessionId = basename(filePath, '.jsonl')
        const lines = parseJsonlFile<Record<string, unknown>>(filePath)

        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index]!
            const uniqueHash = getClaudeUniqueHash(line)

            if (uniqueHash && processedHashes.has(uniqueHash)) {
                continue
            }

            if (uniqueHash) {
                processedHashes.add(uniqueHash)
            }

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
            const interaction: ProjectSessionInteractionItem = {
                content: extractClaudeMessageText(message?.content),
                costUSD: usage?.costUSD ?? 0,
                index,
                model: model ?? null,
                raw: line,
                role: getInteractionRole(line, message),
                timestamp,
                type: getString(line.type) || getString(message?.type) || 'message',
                usage,
            }
            const key = getSessionLookupKey(project, sessionId)
            const detail = details.get(key) ?? createSessionDetail({
                project,
                repository: `local/${project}`,
                sessionId,
                startedAt: timestamp,
                threadName: `Session for ${project}`,
            })

            addInteraction(detail, interaction)
            details.set(key, detail)
        }
    }

    return finalizeSessionDetails(details)
}

async function loadCodexSessionDetails(config: IConfig, resolvePricing: ModelPricingResolver) {
    const details = new Map<string, ProjectSessionDetail>()
    const sessionsDir = join(config.codexPath, 'sessions')

    if (!existsSync(sessionsDir)) {
        return details
    }

    const files = await glob('**/*.jsonl', {
        absolute: true,
        cwd: sessionsDir,
    })

    for (const filePath of files.sort((a, b) => a.localeCompare(b))) {
        const lines = parseJsonlFile<SessionLogLine>(filePath)
        const sessionMeta = lines.find(line => line.type === 'session_meta')?.payload
        const sessionId = getSessionId(filePath, getString(sessionMeta?.id))
        const startedAt = toIsoString(sessionMeta?.timestamp) ?? toIsoString(lines[0]?.timestamp)
        const project = getProjectName(getString(sessionMeta?.cwd))
        const repository = normalizeRepositoryUrl(sessionMeta?.git?.repository_url) || `local/${project}`
        const detail = createSessionDetail({
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

            addInteraction(detail, {
                content: extractCodexContent(line),
                costUSD: usage?.costUSD ?? 0,
                index,
                model: model ?? null,
                raw: line,
                role: getCodexRole(line),
                timestamp,
                type: line.payload?.type ?? line.type ?? 'event',
                usage: usage ? { ...usage, isFallbackModel } : null,
            })
        }

        details.set(getSessionLookupKey(project, sessionId), finalizeSessionDetail(detail))
    }

    return details
}

async function loadGeminiSessionDetails(config: IConfig, resolvePricing: ModelPricingResolver) {
    const details = new Map<string, ProjectSessionDetail>()
    const tmpDir = `${config.geminiPath}/tmp`

    if (!existsSync(tmpDir)) {
        return details
    }

    const fileGroups = await Promise.all([
        glob(`${tmpDir}/*/chats/session-*.json`, { absolute: true }),
        glob(`${tmpDir}/*/chats/sessions-*.json`, { absolute: true }),
    ])
    const files = uniqueItems(fileGroups.flat()).sort((a, b) => a.localeCompare(b))

    for (const filePath of files) {
        const data = parseJsonFile(filePath)

        if (!isGeminiSessionFile(data)) {
            continue
        }

        const startedAt = toIsoString(data.startTime)
            ?? data.messages.map(message => toIsoString(message.timestamp)).find(Boolean)
            ?? null
        const projectRoot = getGeminiProjectRoot(filePath)
        const project = getProjectName(projectRoot, '') || getGeminiProjectKeyFromPath(filePath)
        const repository = getRepositoryNameFromProjectRoot(projectRoot) || `local/${project}`
        const sessionId = data.sessionId?.trim() || basename(filePath, '.json')
        const detail = createSessionDetail({
            project,
            repository,
            sessionId,
            startedAt,
            threadName: getGeminiThreadName(data, project),
        })

        for (let index = 0; index < data.messages.length; index += 1) {
            const message = data.messages[index]!
            const timestamp = toIsoString(message.timestamp)
            const model = message.model?.trim() || (message.tokens ? GEMINI_FALLBACK_MODEL : null)
            const usage = message.tokens && model
                ? getGeminiInteractionUsage(message.tokens, model, resolvePricing)
                : null

            addInteraction(detail, {
                content: extractGeminiMessageText(message.content),
                costUSD: usage?.costUSD ?? 0,
                index,
                model,
                raw: message,
                role: getGeminiRole(message),
                timestamp,
                type: message.type ?? 'message',
                usage,
            })
        }

        details.set(getSessionLookupKey(project, sessionId), finalizeSessionDetail(detail))
    }

    return details
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
        costUSD: roundCurrency(costUSD),
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
        costUSD: roundCurrency(calculateUsageCostUSD(usage, resolvePricing(model))),
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
        costUSD: roundCurrency(costUSD),
        toolTokens,
    }
}

function createSessionDetail(options: {
    project: string
    repository: string
    sessionId: string
    startedAt: string | null
    threadName: string
}): ProjectSessionDetail {
    return {
        cachedInputTokens: 0,
        costUSD: 0,
        durationMinutes: 0,
        inputTokens: 0,
        interactions: [],
        lastActivity: options.startedAt ?? '',
        models: [],
        outputTokens: 0,
        project: options.project,
        reasoningOutputTokens: 0,
        repository: options.repository,
        sessionId: options.sessionId,
        startedAt: options.startedAt ?? '',
        threadName: options.threadName,
        tokenTotal: 0,
    }
}

function addInteraction(detail: ProjectSessionDetail, interaction: ProjectSessionInteractionItem) {
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
        detail.models = uniqueItems([...detail.models, interaction.model])
    }
}

function finalizeSessionDetails(details: Map<string, ProjectSessionDetail>) {
    for (const [key, detail] of details) {
        details.set(key, finalizeSessionDetail(detail))
    }

    return details
}

function finalizeSessionDetail(detail: ProjectSessionDetail) {
    detail.costUSD = roundCurrency(detail.costUSD)
    detail.durationMinutes = getDurationMinutes(detail.startedAt, detail.lastActivity)
    detail.interactions = detail.interactions.sort((a, b) => {
        if (a.timestamp && b.timestamp) {
            return Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.index - b.index
        }

        return a.index - b.index
    })
    detail.models = detail.models.sort((a, b) => a.localeCompare(b))

    return detail
}

function createSessionFromDetail(detail: ProjectSessionDetail): ProjectSessionUsageItem {
    const startedAtDate = new Date(detail.startedAt)
    const dateKey = Number.isFinite(startedAtDate.getTime()) ? getDateKey(startedAtDate) : ''

    return {
        cachedInputTokens: detail.cachedInputTokens,
        costUSD: detail.costUSD,
        date: dateKey ? formatDateLabelFromDateKey(dateKey) : '',
        duration: formatDuration(detail.durationMinutes),
        durationMinutes: detail.durationMinutes,
        id: detail.sessionId,
        inputTokens: detail.inputTokens,
        interactions: detail.interactions,
        model: detail.models[0] ?? 'unknown',
        models: detail.models,
        month: Number.isFinite(startedAtDate.getTime()) ? getMonthKey(startedAtDate) : '',
        outputTokens: detail.outputTokens,
        project: detail.project,
        reasoningOutputTokens: detail.reasoningOutputTokens,
        repository: detail.repository,
        sessionId: detail.sessionId,
        startedAt: detail.startedAt,
        threadName: detail.threadName,
        tokenTotal: detail.tokenTotal,
        week: Number.isFinite(startedAtDate.getTime()) ? getWeekLabel(startedAtDate) : '',
    }
}

function getSessionDateLabel(startedAt: string) {
    const date = new Date(startedAt)

    if (!Number.isFinite(date.getTime())) {
        return ''
    }

    return formatDateLabelFromDateKey(getDateKey(date))
}

async function globClaudeUsageFiles(config: IConfig) {
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

    return fileGroups.flat()
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

    const text = getString(payload.text) || getString(payload.output) || getString(payload.content)

    return text
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

function collectSessionModels(sessions: ProjectSessionUsageItem[]) {
    return uniqueItems(sessions.flatMap(session => session.models)).sort((a, b) => a.localeCompare(b))
}

function getEarliestStartedAt(sessions: Array<{ startedAt: string }>) {
    return sessions
        .map(session => session.startedAt)
        .filter(timestamp => Number.isFinite(Date.parse(timestamp)))
        .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null
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

function uniqueItems<T>(items: T[]) {
    return Array.from(new Set(items))
}
