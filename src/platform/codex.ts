import type { CodexSessionUsageItem } from '#shared/types/codex-dashboard'
import type {
    CodexSessionFileData,
    CodexSessionMeta,
    CodexTokenUsageEvent,
    CodexTopModel,
    CodexTopProject,
    DailyUsageSummaryGroup,
    IConfig,
    LoadCodexUsageResult,
    ModelPricingResolver,
    PeriodRowGroup,
    RawUsage,
    SessionAggregateGroup,
    SessionLogLine,
    SessionUsageSummary,
    TokenUsageDelta,
    TokenUsageSnapshot,
} from '~~/src/types'
import { existsSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { glob } from 'glob'
import { calculateUsageCostUSD, createLiteLLMPricingResolver } from '~~/src/platform/pricing'

const LEGACY_FALLBACK_MODEL = 'gpt-5'
const CODEX_MODEL_ALIASES: Record<string, string> = {
    'gpt-5-codex': 'gpt-5',
    'gpt-5.3-codex': 'gpt-5.2-codex',
}

export const loadCodexUsage = async (config: IConfig): Promise<LoadCodexUsageResult> => {
    const resolvePricing = await createLiteLLMPricingResolver({
        aliases: CODEX_MODEL_ALIASES,
        fallbackModel: LEGACY_FALLBACK_MODEL,
        isZeroCostModel: isOpenRouterFreeModel,
    })
    const sessionFiles = await loadSessionFiles(config)
    const tokenEvents = sessionFiles
        .flatMap(item => item.events)
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))

    const sessionSummaries = buildSessionSummaries(sessionFiles, resolvePricing)
        .sort((a, b) => Date.parse(b.lastActivity) - Date.parse(a.lastActivity))
    const sessionUsage = sessionSummaries
        .map((session) => {
            const startedAtDate = new Date(session.startedAt)

            return {
                id: session.sessionId,
                sessionId: session.sessionId,
                threadName: session.threadName,
                project: session.project,
                repository: session.repository,
                model: session.topModel,
                startedAt: session.startedAt,
                date: formatDateLabelFromDateKey(getDateKey(startedAtDate)),
                month: getMonthKey(startedAtDate),
                week: getWeekLabel(startedAtDate),
                duration: formatDuration(session.durationMinutes),
                durationMinutes: session.durationMinutes,
                inputTokens: session.inputTokens,
                cachedInputTokens: session.cachedInputTokens,
                outputTokens: session.outputTokens,
                reasoningOutputTokens: session.reasoningOutputTokens,
                tokenTotal: session.tokenTotal,
                costUSD: session.costUSD,
            }
        })

    const dailyGroups = buildDailyUsageGroups(tokenEvents, resolvePricing)
    const dailyTokenUsage = Array.from(dailyGroups.values())
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
        .map(group => ({
            date: group.displayLabel,
            inputTokens: group.inputTokens,
            cachedInputTokens: group.cachedInputTokens,
            outputTokens: group.outputTokens,
            reasoningOutputTokens: group.reasoningOutputTokens,
            totalTokens: group.totalTokens,
            costUSD: roundCurrency(group.costUSD),
            models: Object.fromEntries(Array.from(group.modelUsage.entries()).map(([model, usage]) => [model, {
                inputTokens: usage.inputTokens,
                cachedInputTokens: usage.cachedInputTokens,
                outputTokens: usage.outputTokens,
                reasoningOutputTokens: usage.reasoningOutputTokens,
                totalTokens: usage.totalTokens,
                isFallback: usage.isFallback,
            }])),
        }))

    const dailyRows = Array.from(dailyGroups.values())
        .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
        .map(group => ({
            id: group.dateKey,
            label: group.displayLabel,
            period: group.displayLabel,
            models: group.models,
            projects: group.projects,
            sessionCount: group.sessionCount,
            inputTokens: group.inputTokens,
            cachedInputTokens: group.cachedInputTokens,
            outputTokens: group.outputTokens,
            reasoningOutputTokens: group.reasoningOutputTokens,
            totalTokens: group.totalTokens,
            costUSD: roundCurrency(group.costUSD),
        }))

    const weeklyRows = buildPeriodRows(tokenEvents, 'week', resolvePricing)
    const monthlyRows = buildPeriodRows(tokenEvents, 'month', resolvePricing)
    const sessionRows = sessionSummaries
        .map(session => ({
            id: session.sessionId,
            label: session.sessionId,
            period: formatDateLabelFromDateKey(getDateKey(new Date(session.lastActivity))),
            models: session.models,
            projects: [session.project],
            sessionCount: 1,
            inputTokens: session.inputTokens,
            cachedInputTokens: session.cachedInputTokens,
            outputTokens: session.outputTokens,
            reasoningOutputTokens: session.reasoningOutputTokens,
            totalTokens: session.tokenTotal,
            costUSD: session.costUSD,
        }))

    const monthlyModelUsage = buildMonthlyModelUsage(tokenEvents)
    const projectUsage = buildProjectUsage(sessionUsage)
    const todayDateKey = getDateKey(new Date())
    const todayEvents = tokenEvents.filter(event => getDateKey(new Date(event.timestamp)) === todayDateKey)
    const todayDailyGroup = dailyGroups.get(todayDateKey)
    const todayTotalTokens = todayDailyGroup?.totalTokens ?? 0
    const todayTotalCost = roundCurrency(todayDailyGroup?.costUSD ?? 0)
    const todayTopProject = getTopProjectForDate(todayEvents)
    const todayTopModel = getTopModelForDate(todayEvents)
    const overviewCards = buildOverviewCards({
        cachedInputTokens: todayDailyGroup?.cachedInputTokens ?? 0,
        sessionCount: new Set(todayEvents.map(event => event.sessionId)).size,
        todayTopModel,
        todayTopProject,
        todayTotalCost,
        todayTotalTokens,
    })

    return {
        dailyRows,
        dailyTokenUsage,
        monthlyModelUsage,
        monthlyRows,
        overviewCards,
        projectUsage,
        sessionRows,
        sessionUsage,
        todayTopModel,
        todayTopProject,
        todayTotalCost,
        todayTotalTokens,
        weeklyRows,
    }
}

async function loadSessionFiles(config: IConfig) {
    const sessionsDir = `${config.codexPath}/sessions`

    if (!existsSync(sessionsDir)) {
        return []
    }

    const files = await glob(`**/*.jsonl`, {
        cwd: sessionsDir,
        absolute: true,
    })

    return files.map(loadSessionFile).filter((item): item is CodexSessionFileData => item !== null)
}

function loadSessionFile(filePath: string): CodexSessionFileData | null {
    const lines = parseJsonlFile(filePath)

    if (lines.length === 0) {
        return null
    }

    const sessionMeta = lines.find(line => line.type === 'session_meta')?.payload
    const startedAt = toIsoString(sessionMeta?.timestamp) ?? toIsoString(lines[0]?.timestamp)

    if (!startedAt) {
        return null
    }

    const lastTimestamp = [...lines]
        .reverse()
        .map(line => toIsoString(line.timestamp))
        .find(Boolean)
    const userMessage = lines.find(line => line.type === 'event_msg' && line.payload?.type === 'user_message')
        ?.payload
        ?.message
    const sessionId = basename(filePath, '.jsonl')
    const project = getProjectName(typeof sessionMeta?.cwd === 'string' ? sessionMeta.cwd : undefined)
    const repository = normalizeRepositoryUrl(sessionMeta?.git?.repository_url) || `local/${project}`

    const meta: CodexSessionMeta = {
        sessionId,
        threadName: getThreadName(typeof userMessage === 'string' ? userMessage : '', project),
        project,
        repository,
        startedAt,
        durationMinutes: getDurationMinutes(startedAt, lastTimestamp),
    }
    const events = extractTokenUsageEvents(lines, meta)

    if (events.length === 0) {
        return null
    }

    return {
        events,
        meta,
    }
}

function parseJsonlFile(filePath: string) {
    const content = readFileSync(filePath, 'utf8')

    if (!content.trim()) {
        return [] as SessionLogLine[]
    }

    const lines: SessionLogLine[] = []

    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim()

        if (!line) {
            continue
        }

        try {
            lines.push(JSON.parse(line) as SessionLogLine)
        }
        catch {
            continue
        }
    }

    return lines
}

function extractTokenUsageEvents(lines: SessionLogLine[], meta: CodexSessionMeta) {
    const events: CodexTokenUsageEvent[] = []
    let previousTotals: RawUsage | null = null
    let currentModel: string | undefined
    let currentModelIsFallback = false

    for (const line of lines) {
        if (line.type === 'turn_context') {
            const contextModel = extractModel(line.payload)

            if (contextModel) {
                currentModel = contextModel
                currentModelIsFallback = false
            }

            continue
        }

        if (line.type !== 'event_msg' || line.payload?.type !== 'token_count') {
            continue
        }

        const timestamp = toIsoString(line.timestamp)

        if (!timestamp) {
            continue
        }

        const info = line.payload?.info
        const lastUsage = normalizeRawUsage(info?.last_token_usage)
        const totalUsage = normalizeRawUsage(info?.total_token_usage)
        const rawUsage = lastUsage ?? (totalUsage ? subtractRawUsage(totalUsage, previousTotals) : null)

        if (totalUsage) {
            previousTotals = totalUsage
        }

        if (!rawUsage) {
            continue
        }

        const delta = convertToDisplayDelta(rawUsage)

        if (isZeroUsage(delta)) {
            continue
        }

        const extractedModel = extractModel({
            ...(line.payload ?? {}),
            info: info ?? undefined,
        })

        if (extractedModel) {
            currentModel = extractedModel
            currentModelIsFallback = false
        }

        let model = extractedModel ?? currentModel
        let isFallbackModel = false

        if (!model) {
            model = LEGACY_FALLBACK_MODEL
            isFallbackModel = true
            currentModel = model
            currentModelIsFallback = true
        }
        else if (!extractedModel && currentModelIsFallback) {
            isFallbackModel = true
        }

        events.push({
            ...delta,
            isFallbackModel,
            model,
            project: meta.project,
            repository: meta.repository,
            sessionId: meta.sessionId,
            timestamp,
        })
    }

    return events
}

function normalizeRawUsage(usage: TokenUsageSnapshot | null | undefined): RawUsage | null {
    if (!usage) {
        return null
    }

    const input = normalizeNumber(usage.input_tokens)
    const cachedInput = normalizeNumber(usage.cached_input_tokens ?? usage.cache_read_input_tokens)
    const output = normalizeNumber(usage.output_tokens)
    const reasoning = normalizeNumber(usage.reasoning_output_tokens)
    const total = normalizeNumber(usage.total_tokens)

    return {
        input_tokens: input,
        cached_input_tokens: cachedInput,
        output_tokens: output,
        reasoning_output_tokens: reasoning,
        total_tokens: total > 0 ? total : input + output,
    }
}

function subtractRawUsage(current: RawUsage, previous: RawUsage | null): RawUsage {
    return {
        input_tokens: Math.max(current.input_tokens - (previous?.input_tokens ?? 0), 0),
        cached_input_tokens: Math.max(current.cached_input_tokens - (previous?.cached_input_tokens ?? 0), 0),
        output_tokens: Math.max(current.output_tokens - (previous?.output_tokens ?? 0), 0),
        reasoning_output_tokens: Math.max(current.reasoning_output_tokens - (previous?.reasoning_output_tokens ?? 0), 0),
        total_tokens: Math.max(current.total_tokens - (previous?.total_tokens ?? 0), 0),
    }
}

function convertToDisplayDelta(rawUsage: RawUsage): TokenUsageDelta {
    const cachedInputTokens = Math.min(rawUsage.cached_input_tokens, rawUsage.input_tokens)
    const inputTokens = Math.max(rawUsage.input_tokens - cachedInputTokens, 0)
    const outputTokens = Math.max(rawUsage.output_tokens, 0)

    return {
        cachedInputTokens,
        inputTokens,
        outputTokens,
        reasoningOutputTokens: Math.max(0, Math.min(rawUsage.reasoning_output_tokens, outputTokens)),
        totalTokens: rawUsage.total_tokens > 0 ? rawUsage.total_tokens : rawUsage.input_tokens + outputTokens,
    }
}

function isZeroUsage(usage: TokenUsageDelta) {
    return usage.inputTokens === 0
        && usage.cachedInputTokens === 0
        && usage.outputTokens === 0
        && usage.reasoningOutputTokens === 0
        && usage.totalTokens === 0
}

function extractModel(value: unknown): string | undefined {
    if (!value || typeof value !== 'object') {
        return undefined
    }

    const record = value as Record<string, unknown>
    const directCandidates = [
        record.model,
        record.model_name,
        (record.info as Record<string, unknown> | null | undefined)?.model,
        (record.info as Record<string, unknown> | null | undefined)?.model_name,
        ((record.info as Record<string, unknown> | null | undefined)?.metadata as Record<string, unknown> | null | undefined)?.model,
        (record.metadata as Record<string, unknown> | null | undefined)?.model,
    ]

    for (const candidate of directCandidates) {
        if (typeof candidate === 'string' && candidate.trim() !== '') {
            return candidate.trim()
        }
    }

    return undefined
}

function buildSessionSummaries(sessionFiles: CodexSessionFileData[], resolvePricing: ModelPricingResolver) {
    const summaries: SessionUsageSummary[] = []

    for (const sessionFile of sessionFiles) {
        const usageByModel = new Map<string, TokenUsageDelta>()
        let inputTokens = 0
        let cachedInputTokens = 0
        let outputTokens = 0
        let reasoningOutputTokens = 0
        let totalTokens = 0
        let lastActivity = sessionFile.meta.startedAt

        for (const event of sessionFile.events) {
            inputTokens += event.inputTokens
            cachedInputTokens += event.cachedInputTokens
            outputTokens += event.outputTokens
            reasoningOutputTokens += event.reasoningOutputTokens
            totalTokens += event.totalTokens

            if (event.timestamp > lastActivity) {
                lastActivity = event.timestamp
            }

            const modelUsage = usageByModel.get(event.model) ?? createEmptyUsage()
            addUsage(modelUsage, event)
            usageByModel.set(event.model, modelUsage)
        }

        let costUSD = 0

        for (const [model, usage] of usageByModel) {
            costUSD += calculateUsageCost(model, usage, resolvePricing)
        }

        const models = Array.from(usageByModel.keys()).sort((a, b) => a.localeCompare(b))
        const topModel = Array.from(usageByModel.entries())
            .sort((a, b) => b[1].totalTokens - a[1].totalTokens || a[0].localeCompare(b[0]))[0]?.[0] ?? LEGACY_FALLBACK_MODEL

        summaries.push({
            sessionId: sessionFile.meta.sessionId,
            threadName: sessionFile.meta.threadName,
            project: sessionFile.meta.project,
            repository: sessionFile.meta.repository,
            startedAt: sessionFile.meta.startedAt,
            durationMinutes: sessionFile.meta.durationMinutes,
            inputTokens,
            cachedInputTokens,
            outputTokens,
            reasoningOutputTokens,
            tokenTotal: totalTokens,
            costUSD: roundCurrency(costUSD),
            lastActivity,
            models,
            topModel,
        })
    }

    return summaries
}

function buildDailyUsageGroups(events: CodexTokenUsageEvent[], resolvePricing: ModelPricingResolver) {
    const groups = new Map<string, DailyUsageSummaryGroup>()

    for (const event of events) {
        const dateKey = getDateKey(new Date(event.timestamp))
        const displayLabel = formatDateLabelFromDateKey(dateKey)
        const group = groups.get(dateKey) ?? {
            ...createAggregateGroup(displayLabel),
            dateKey,
            displayLabel,
            modelUsage: new Map(),
            sessionIds: new Set<string>(),
        }

        addEventToAggregateGroup(group, event, resolvePricing)
        group.sessionIds.add(event.sessionId)
        group.sessionCount = group.sessionIds.size

        const modelUsage = group.modelUsage.get(event.model) ?? {
            ...createEmptyUsage(),
            isFallback: false,
        }
        addUsage(modelUsage, event)
        if (event.isFallbackModel) {
            modelUsage.isFallback = true
        }
        group.modelUsage.set(event.model, modelUsage)
        groups.set(dateKey, group)
    }

    return groups
}

function buildPeriodRows(
    events: CodexTokenUsageEvent[],
    periodType: 'month' | 'week',
    resolvePricing: ModelPricingResolver,
) {
    const groups = new Map<string, PeriodRowGroup>()

    for (const event of events) {
        const eventDate = new Date(event.timestamp)
        const key = periodType === 'month'
            ? getMonthKey(eventDate)
            : getWeekLabel(eventDate)
        const label = periodType === 'month'
            ? formatMonthLabel(key)
            : key
        const group = groups.get(key) ?? {
            ...createAggregateGroup(label),
            sessionIds: new Set<string>(),
        }

        addEventToAggregateGroup(group, event, resolvePricing)
        group.sessionIds.add(event.sessionId)
        groups.set(key, group)
    }

    return Array.from(groups.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([key, group]) => ({
            id: key,
            label: group.label,
            period: group.label,
            models: group.models,
            projects: group.projects,
            sessionCount: group.sessionIds.size,
            inputTokens: group.inputTokens,
            cachedInputTokens: group.cachedInputTokens,
            outputTokens: group.outputTokens,
            reasoningOutputTokens: group.reasoningOutputTokens,
            totalTokens: group.totalTokens,
            costUSD: roundCurrency(group.costUSD),
        }))
}

function buildMonthlyModelUsage(events: CodexTokenUsageEvent[]) {
    const groups = new Map<string, {
        model: string
        month: string
        totalTokens: number
    }>()

    for (const event of events) {
        const month = getMonthKey(new Date(event.timestamp))
        const key = `${month}__${event.model}`
        const group = groups.get(key) ?? {
            model: event.model,
            month,
            totalTokens: 0,
        }
        group.totalTokens += event.totalTokens
        groups.set(key, group)
    }

    return Array.from(groups.values())
        .map(group => ({
            model: group.model,
            month: group.month,
            tokenTotal: group.totalTokens,
        }))
        .sort((a, b) => a.month.localeCompare(b.month) || a.model.localeCompare(b.model))
}

function createAggregateGroup(label: string): SessionAggregateGroup {
    return {
        cachedInputTokens: 0,
        costUSD: 0,
        inputTokens: 0,
        label,
        models: [],
        outputTokens: 0,
        projects: [],
        reasoningOutputTokens: 0,
        sessionCount: 0,
        totalTokens: 0,
    }
}

function addEventToAggregateGroup(
    group: SessionAggregateGroup,
    event: CodexTokenUsageEvent,
    resolvePricing: ModelPricingResolver,
) {
    group.inputTokens += event.inputTokens
    group.cachedInputTokens += event.cachedInputTokens
    group.outputTokens += event.outputTokens
    group.reasoningOutputTokens += event.reasoningOutputTokens
    group.totalTokens += event.totalTokens
    group.costUSD += calculateUsageCost(event.model, event, resolvePricing)
    group.models = uniqueItems([...group.models, event.model])
    group.projects = uniqueItems([...group.projects, event.project])
}

function createEmptyUsage(): TokenUsageDelta {
    return {
        cachedInputTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 0,
    }
}

function addUsage(target: TokenUsageDelta, usage: TokenUsageDelta) {
    target.inputTokens += usage.inputTokens
    target.cachedInputTokens += usage.cachedInputTokens
    target.outputTokens += usage.outputTokens
    target.reasoningOutputTokens += usage.reasoningOutputTokens
    target.totalTokens += usage.totalTokens
}

function calculateUsageCost(model: string, usage: TokenUsageDelta, resolvePricing: ModelPricingResolver) {
    return calculateUsageCostUSD(usage, resolvePricing(model))
}

function isOpenRouterFreeModel(model: string) {
    const normalizedModel = model.trim().toLowerCase()

    if (normalizedModel === 'openrouter/free') {
        return true
    }

    return normalizedModel.startsWith('openrouter/') && normalizedModel.endsWith(':free')
}

function buildProjectUsage(sessionUsage: CodexSessionUsageItem[]) {
    const projects = new Map<string, {
        costUSD: number
        repository: string
        sessions: number
        tokenTotal: number
    }>()

    for (const session of sessionUsage) {
        const project = projects.get(session.project) ?? {
            costUSD: 0,
            repository: session.repository,
            sessions: 0,
            tokenTotal: 0,
        }
        project.costUSD += session.costUSD
        project.sessions += 1
        project.tokenTotal += session.tokenTotal
        projects.set(session.project, project)
    }

    const maxCost = Math.max(...Array.from(projects.values()).map(project => project.costUSD), 0)

    return Array.from(projects.entries())
        .map(([label, project]) => ({
            label,
            repository: project.repository,
            sessions: project.sessions,
            tokenTotal: project.tokenTotal,
            costUSD: project.costUSD,
            value: formatCurrency(project.costUSD),
            detail: `${project.sessions} sessions / ${formatCompactNumber(project.tokenTotal)} tokens`,
            percent: maxCost > 0 ? (project.costUSD / maxCost) * 100 : 0,
            tone: 'amber' as const,
        }))
        .sort((a, b) => b.costUSD - a.costUSD)
}

function buildOverviewCards(options: {
    cachedInputTokens: number
    sessionCount: number
    todayTopModel: CodexTopModel | null
    todayTopProject: CodexTopProject | null
    todayTotalCost: number
    todayTotalTokens: number
}) {
    return [
        {
            icon: 'solar:cpu-line-duotone',
            name: 'Today Tokens',
            trend: `${options.sessionCount} sessions`,
            trendTone: 'neutral' as const,
            value: formatCompactNumber(options.todayTotalTokens),
        },
        {
            icon: 'lucide:wallet',
            name: 'Today Spend',
            trend: `${formatCompactNumber(options.cachedInputTokens)} cached`,
            trendTone: 'neutral' as const,
            value: formatCurrency(options.todayTotalCost),
        },
        {
            icon: 'lucide:folder-git-2',
            name: 'Top Session Project',
            trend: options.todayTopProject ? `${options.todayTopProject.sessionCount} sessions` : 'No sessions',
            trendTone: 'up' as const,
            value: options.todayTopProject?.project ?? 'No data',
        },
        {
            icon: 'lucide:bot',
            name: 'Top Invoked Model',
            trend: options.todayTopModel ? `${formatCompactNumber(options.todayTopModel.totalTokens)} tokens` : 'No usage',
            trendTone: 'up' as const,
            value: options.todayTopModel?.model ?? 'No data',
        },
    ]
}

function getTopProjectForDate(events: CodexTokenUsageEvent[]) {
    const projects = new Map<string, Set<string>>()

    for (const event of events) {
        const sessions = projects.get(event.project) ?? new Set<string>()
        sessions.add(event.sessionId)
        projects.set(event.project, sessions)
    }

    const topProject = Array.from(projects.entries())
        .map(([project, sessions]) => ({ project, sessionCount: sessions.size }))
        .sort((a, b) => b.sessionCount - a.sessionCount || a.project.localeCompare(b.project))[0]

    return topProject ?? null
}

function getTopModelForDate(events: CodexTokenUsageEvent[]) {
    const models = new Map<string, number>()

    for (const event of events) {
        models.set(event.model, (models.get(event.model) ?? 0) + event.totalTokens)
    }

    const topModel = Array.from(models.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]

    return topModel
        ? {
                model: topModel[0],
                totalTokens: topModel[1],
            }
        : null
}

function getThreadName(message: string, project: string) {
    const firstLine = message
        .split('\n')
        .map(line => line.trim())
        .find(line => line && !line.startsWith('<'))

    if (!firstLine) {
        return `Session for ${project}`
    }

    return firstLine.length > 96 ? `${firstLine.slice(0, 93)}...` : firstLine
}

function getProjectName(cwd: string | undefined) {
    if (!cwd) {
        return 'unknown'
    }

    const parts = cwd.split('/').filter(Boolean)

    return parts.at(-1) ?? 'unknown'
}

function normalizeRepositoryUrl(repositoryUrl: string | undefined) {
    if (!repositoryUrl) {
        return ''
    }

    return repositoryUrl
        .replace(/^git@[^:]+:/u, '')
        .replace(/^https?:\/\/[^/]+\//u, '')
        .replace(/\.git$/u, '')
}

function getDurationMinutes(startedAt: string, endedAt?: string | null) {
    if (!endedAt) {
        return 0
    }

    const durationMs = Date.parse(endedAt) - Date.parse(startedAt)

    if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return 0
    }

    return Math.round(durationMs / 60_000)
}

function normalizeNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function toIsoString(value: unknown) {
    if (typeof value !== 'string') {
        return null
    }

    const timestamp = Date.parse(value)

    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function getDateKey(date: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).formatToParts(date)
    const year = parts.find(part => part.type === 'year')?.value ?? '0000'
    const month = parts.find(part => part.type === 'month')?.value ?? '01'
    const day = parts.find(part => part.type === 'day')?.value ?? '01'

    return `${year}-${month}-${day}`
}

function getMonthKey(date: Date) {
    return getDateKey(date).slice(0, 7)
}

function getWeekLabel(date: Date) {
    const weekStart = cloneDate(date)
    const day = weekStart.getDay()
    const diff = day === 0 ? -6 : 1 - day
    weekStart.setDate(weekStart.getDate() + diff)

    const weekEnd = cloneDate(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)

    return `${getDateKey(weekStart)} - ${getDateKey(weekEnd)}`
}

function cloneDate(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatDateLabelFromDateKey(dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(value => Number.parseInt(value, 10))
    const date = new Date(Date.UTC(year || 0, (month || 1) - 1, day || 1))

    return new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        month: 'short',
        timeZone: 'UTC',
        year: 'numeric',
    }).format(date)
}

function formatMonthLabel(monthKey: string) {
    const [year, month] = monthKey.split('-').map(value => Number.parseInt(value, 10))
    const date = new Date(Date.UTC(year || 0, (month || 1) - 1, 1))

    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        timeZone: 'UTC',
        year: 'numeric',
    }).format(date)
}

function formatDuration(minutes: number) {
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60

    if (hours === 0) {
        return `${remainingMinutes}m`
    }

    if (remainingMinutes === 0) {
        return `${hours}h`
    }

    return `${hours}h ${remainingMinutes}m`
}

function formatCompactNumber(value: number) {
    return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 1,
        notation: 'compact',
    }).format(value)
}

function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-US', {
        currency: 'USD',
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
        style: 'currency',
    }).format(value)
}

function uniqueItems(items: string[]) {
    return Array.from(new Set(items))
}

function roundCurrency(value: number) {
    return Math.round(value * 1_000_000) / 1_000_000
}
