import type { CodexSessionUsageItem } from '#shared/types/codex-dashboard'
import type {
    CodexModelUsageSummary,
    CodexSessionMeta,
    CodexTopModel,
    CodexTopProject,
    DailyUsageSummaryGroup,
    IConfig,
    LoadCodexUsageResult,
    ModelPricing,
    PeriodRowGroup,
    SessionAggregateGroup,
    SessionUsageSummary,
    TokenUsageDelta,
} from '~~/src/types'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, sep } from 'node:path'
import { glob } from 'glob'
import { calculateUsageCostUSD, createLiteLLMPricingResolver } from '~~/src/platform/pricing'

const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash'
const GEMINI_MODEL_ALIASES: Record<string, string> = {
    'gemini-3-flash-preview': 'gemini-3-flash',
}
const GEMINI_FALLBACK_PRICING_TABLE: Record<string, ModelPricing> = {
    'gemini-2.5-flash': {
        cachedInputCostPerMTokens: 0.075,
        cacheCreationInputCostPerMTokens: 0.3,
        inputCostPerMTokens: 0.3,
        outputCostPerMTokens: 2.5,
    },
    'gemini-2.5-flash-lite': {
        cachedInputCostPerMTokens: 0.025,
        cacheCreationInputCostPerMTokens: 0.1,
        inputCostPerMTokens: 0.1,
        outputCostPerMTokens: 0.4,
    },
    'gemini-2.5-pro': {
        cachedInputCostPerMTokens: 0.31,
        cachedInputCostPerMTokensAbove200K: 0.625,
        cacheCreationInputCostPerMTokens: 1.25,
        cacheCreationInputCostPerMTokensAbove200K: 2.5,
        inputCostPerMTokens: 1.25,
        inputCostPerMTokensAbove200K: 2.5,
        outputCostPerMTokens: 10,
        outputCostPerMTokensAbove200K: 15,
    },
    'gemini-3-flash': {
        cachedInputCostPerMTokens: 0.05,
        cacheCreationInputCostPerMTokens: 0.5,
        inputCostPerMTokens: 0.5,
        outputCostPerMTokens: 3,
    },
    'gemini-3-flash-preview': {
        cachedInputCostPerMTokens: 0.05,
        cacheCreationInputCostPerMTokens: 0.5,
        inputCostPerMTokens: 0.5,
        outputCostPerMTokens: 3,
    },
}

interface GeminiSessionFileData {
    events: GeminiTokenUsageEvent[]
    meta: CodexSessionMeta
}

interface GeminiTokenUsageEvent extends TokenUsageDelta {
    costUSD: number
    isFallbackModel: boolean
    model: string
    project: string
    repository: string
    sessionId: string
    timestamp: string
    toolTokens: number
}

interface GeminiSessionFile {
    lastUpdated?: string
    messages: GeminiSessionMessage[]
    sessionId?: string
    startTime?: string
    summary?: string
}

interface GeminiSessionMessage {
    content?: string | Array<{ text?: string }>
    model?: string
    timestamp?: string
    tokens?: GeminiTokenSnapshot
    type?: string
}

interface GeminiTokenSnapshot {
    cached?: number
    input?: number
    output?: number
    thoughts?: number
    tool?: number
    total?: number
}

export const loadGeminiUsage = async (config: IConfig): Promise<LoadCodexUsageResult> => {
    const resolvePricing = await createLiteLLMPricingResolver({
        aliases: GEMINI_MODEL_ALIASES,
        fallbackModel: GEMINI_FALLBACK_MODEL,
        fallbackPricingTable: GEMINI_FALLBACK_PRICING_TABLE,
        getLookupCandidates: getGeminiLookupCandidates,
    })
    const sessionFiles = await loadGeminiSessionFiles(config, resolvePricing)
    const events = sessionFiles
        .flatMap(item => item.events)
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))

    const sessionSummaries = buildSessionSummaries(sessionFiles)
        .sort((a, b) => Date.parse(b.lastActivity) - Date.parse(a.lastActivity))
    const sessionUsage = sessionSummaries.map(toGeminiSessionUsageItem)

    const dailyGroups = buildDailyUsageGroups(events)
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

    const weeklyRows = buildPeriodRows(events, 'week')
    const monthlyRows = buildPeriodRows(events, 'month')
    const sessionRows = sessionSummaries.map(session => ({
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

    const monthlyModelUsage = buildMonthlyModelUsage(events)
    const projectUsage = buildProjectUsage(sessionUsage)
    const todayDateKey = getActiveDateKey(dailyGroups)
    const todayEvents = events.filter(event => getDateKey(new Date(event.timestamp)) === todayDateKey)
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

async function loadGeminiSessionFiles(config: IConfig, resolvePricing: (model: string) => ModelPricing) {
    const tmpDir = `${config.geminiPath}/tmp`

    if (!existsSync(tmpDir)) {
        return []
    }

    const fileGroups = await Promise.all([
        glob(`${tmpDir}/*/chats/session-*.json`, { absolute: true }),
        glob(`${tmpDir}/*/chats/sessions-*.json`, { absolute: true }),
    ])
    const files = uniqueItems(fileGroups.flat()).sort((a, b) => a.localeCompare(b))

    return files
        .map(filePath => loadGeminiSessionFile(filePath, resolvePricing))
        .filter((item): item is GeminiSessionFileData => item !== null)
}

function loadGeminiSessionFile(filePath: string, resolvePricing: (model: string) => ModelPricing): GeminiSessionFileData | null {
    const data = parseJsonFile(filePath)

    if (!isGeminiSessionFile(data)) {
        return null
    }

    const startedAt = toIsoString(data.startTime)
        ?? data.messages.map(message => toIsoString(message.timestamp)).find(Boolean)

    if (!startedAt) {
        return null
    }

    const lastTimestamp = toIsoString(data.lastUpdated)
        ?? [...data.messages].reverse().map(message => toIsoString(message.timestamp)).find(Boolean)
    const projectRoot = getProjectRoot(filePath)
    const project = getProjectName(projectRoot) || getProjectKeyFromPath(filePath)
    const repository = getRepositoryName(projectRoot) || `local/${project}`
    const sessionId = data.sessionId?.trim() || basename(filePath, '.json')

    const meta: CodexSessionMeta = {
        durationMinutes: getDurationMinutes(startedAt, lastTimestamp),
        project,
        repository,
        sessionId,
        startedAt,
        threadName: getThreadName(getFirstUserMessage(data), data.summary, project),
    }
    const events = extractTokenUsageEvents(data.messages, meta, resolvePricing)

    if (events.length === 0) {
        return null
    }

    return {
        events,
        meta,
    }
}

function parseJsonFile(filePath: string) {
    try {
        return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
    }
    catch {
        return null
    }
}

function isGeminiSessionFile(value: unknown): value is GeminiSessionFile {
    if (!value || typeof value !== 'object') {
        return false
    }

    const record = value as Record<string, unknown>

    return Array.isArray(record.messages)
}

function extractTokenUsageEvents(
    messages: GeminiSessionMessage[],
    meta: CodexSessionMeta,
    resolvePricing: (model: string) => ModelPricing,
) {
    const events: GeminiTokenUsageEvent[] = []

    for (const message of messages) {
        if (message.type !== 'gemini' || !message.tokens) {
            continue
        }

        const timestamp = toIsoString(message.timestamp)

        if (!timestamp) {
            continue
        }

        const model = message.model?.trim() || GEMINI_FALLBACK_MODEL
        const isFallbackModel = !message.model?.trim()
        const usage = convertToDisplayUsage(message.tokens)

        if (isZeroUsage(usage)) {
            continue
        }

        const toolTokens = normalizeNumber(message.tokens.tool)
        const costUSD = calculateUsageCostUSD({
            cachedInputTokens: usage.cachedInputTokens,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens + usage.reasoningOutputTokens + toolTokens,
        }, resolvePricing(model))

        events.push({
            ...usage,
            costUSD,
            isFallbackModel,
            model,
            project: meta.project,
            repository: meta.repository,
            sessionId: meta.sessionId,
            timestamp,
            toolTokens,
        })
    }

    return events
}

function convertToDisplayUsage(tokens: GeminiTokenSnapshot): TokenUsageDelta {
    const rawInputTokens = normalizeNumber(tokens.input)
    const cachedInputTokens = Math.min(normalizeNumber(tokens.cached), rawInputTokens)
    const outputTokens = normalizeNumber(tokens.output)
    const reasoningOutputTokens = normalizeNumber(tokens.thoughts)
    const toolTokens = normalizeNumber(tokens.tool)
    const totalTokens = normalizeNumber(tokens.total)

    return {
        cachedInputTokens,
        inputTokens: Math.max(rawInputTokens - cachedInputTokens, 0),
        outputTokens,
        reasoningOutputTokens,
        totalTokens: totalTokens > 0
            ? totalTokens
            : rawInputTokens + outputTokens + reasoningOutputTokens + toolTokens,
    }
}

function isZeroUsage(usage: TokenUsageDelta) {
    return usage.inputTokens === 0
        && usage.cachedInputTokens === 0
        && usage.outputTokens === 0
        && usage.reasoningOutputTokens === 0
        && usage.totalTokens === 0
}

function buildSessionSummaries(sessionFiles: GeminiSessionFileData[]) {
    const summaries: SessionUsageSummary[] = []

    for (const sessionFile of sessionFiles) {
        const usageByModel = new Map<string, TokenUsageDelta>()
        let inputTokens = 0
        let cachedInputTokens = 0
        let outputTokens = 0
        let reasoningOutputTokens = 0
        let totalTokens = 0
        let costUSD = 0
        let lastActivity = sessionFile.meta.startedAt

        for (const event of sessionFile.events) {
            inputTokens += event.inputTokens
            cachedInputTokens += event.cachedInputTokens
            outputTokens += event.outputTokens
            reasoningOutputTokens += event.reasoningOutputTokens
            totalTokens += event.totalTokens
            costUSD += event.costUSD

            if (event.timestamp > lastActivity) {
                lastActivity = event.timestamp
            }

            const modelUsage = usageByModel.get(event.model) ?? createEmptyUsage()
            addUsage(modelUsage, event)
            usageByModel.set(event.model, modelUsage)
        }

        const models = Array.from(usageByModel.keys()).sort((a, b) => a.localeCompare(b))
        const topModel = Array.from(usageByModel.entries())
            .sort((a, b) => b[1].totalTokens - a[1].totalTokens || a[0].localeCompare(b[0]))[0]?.[0] ?? GEMINI_FALLBACK_MODEL

        summaries.push({
            cachedInputTokens,
            costUSD: roundCurrency(costUSD),
            durationMinutes: sessionFile.meta.durationMinutes,
            inputTokens,
            lastActivity,
            models,
            outputTokens,
            project: sessionFile.meta.project,
            reasoningOutputTokens,
            repository: sessionFile.meta.repository,
            sessionId: sessionFile.meta.sessionId,
            startedAt: sessionFile.meta.startedAt,
            threadName: sessionFile.meta.threadName,
            tokenTotal: totalTokens,
            topModel,
        })
    }

    return summaries
}

function toGeminiSessionUsageItem(session: SessionUsageSummary): CodexSessionUsageItem {
    const startedAtDate = new Date(session.startedAt)

    return {
        cachedInputTokens: session.cachedInputTokens,
        costUSD: session.costUSD,
        date: formatDateLabelFromDateKey(getDateKey(startedAtDate)),
        duration: formatDuration(session.durationMinutes),
        durationMinutes: session.durationMinutes,
        id: session.sessionId,
        inputTokens: session.inputTokens,
        model: session.topModel,
        month: getMonthKey(startedAtDate),
        outputTokens: session.outputTokens,
        project: session.project,
        reasoningOutputTokens: session.reasoningOutputTokens,
        repository: session.repository,
        sessionId: session.sessionId,
        startedAt: session.startedAt,
        threadName: session.threadName,
        tokenTotal: session.tokenTotal,
        week: getWeekLabel(startedAtDate),
    }
}

function buildDailyUsageGroups(events: GeminiTokenUsageEvent[]) {
    const groups = new Map<string, DailyUsageSummaryGroup>()

    for (const event of events) {
        const dateKey = getDateKey(new Date(event.timestamp))
        const displayLabel = formatDateLabelFromDateKey(dateKey)
        const group = groups.get(dateKey) ?? {
            ...createAggregateGroup(displayLabel),
            dateKey,
            displayLabel,
            modelUsage: new Map<string, CodexModelUsageSummary>(),
            sessionIds: new Set<string>(),
        }

        addEventToAggregateGroup(group, event)
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

function buildPeriodRows(events: GeminiTokenUsageEvent[], periodType: 'month' | 'week') {
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

        addEventToAggregateGroup(group, event)
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

function buildMonthlyModelUsage(events: GeminiTokenUsageEvent[]) {
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

function addEventToAggregateGroup(group: SessionAggregateGroup, event: GeminiTokenUsageEvent) {
    group.inputTokens += event.inputTokens
    group.cachedInputTokens += event.cachedInputTokens
    group.outputTokens += event.outputTokens
    group.reasoningOutputTokens += event.reasoningOutputTokens
    group.totalTokens += event.totalTokens
    group.costUSD += event.costUSD
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

function getActiveDateKey(dailyGroups: Map<string, DailyUsageSummaryGroup>) {
    const todayDateKey = getDateKey(new Date())

    if (dailyGroups.has(todayDateKey)) {
        return todayDateKey
    }

    return Array.from(dailyGroups.keys()).sort((a, b) => b.localeCompare(a))[0] ?? todayDateKey
}

function getTopProjectForDate(events: GeminiTokenUsageEvent[]) {
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

function getTopModelForDate(events: GeminiTokenUsageEvent[]) {
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

function getGeminiLookupCandidates(model: string) {
    const normalizedModel = model.trim()

    return [
        normalizedModel,
        normalizedModel.replace(/^gemini\//u, ''),
        normalizedModel.replace(/^google\//u, ''),
        `gemini/${normalizedModel}`,
        `google/${normalizedModel}`,
    ]
}

function getProjectRoot(filePath: string) {
    const projectDir = dirname(dirname(filePath))
    const projectRootFile = `${projectDir}/.project_root`

    if (!existsSync(projectRootFile)) {
        return ''
    }

    try {
        return readFileSync(projectRootFile, 'utf8').trim()
    }
    catch {
        return ''
    }
}

function getProjectKeyFromPath(filePath: string) {
    const normalizedPath = filePath.replace(/[/\\]/g, sep)
    const segments = normalizedPath.split(sep)
    const tmpIndex = segments.findIndex(segment => segment === 'tmp')

    if (tmpIndex === -1 || tmpIndex + 1 >= segments.length) {
        return 'unknown'
    }

    return segments[tmpIndex + 1]?.trim() || 'unknown'
}

function getProjectName(projectRoot: string) {
    if (!projectRoot) {
        return ''
    }

    const parts = projectRoot.split('/').filter(Boolean)

    return parts.at(-1) ?? ''
}

function getRepositoryName(projectRoot: string) {
    if (!projectRoot) {
        return ''
    }

    const gitConfigPath = `${projectRoot}/.git/config`

    if (!existsSync(gitConfigPath)) {
        return ''
    }

    try {
        const config = readFileSync(gitConfigPath, 'utf8')

        return normalizeRepositoryUrl(getOriginUrlFromGitConfig(config))
    }
    catch {
        return ''
    }
}

function getOriginUrlFromGitConfig(config: string) {
    let isOriginBlock = false

    for (const rawLine of config.split('\n')) {
        const line = rawLine.trim()

        if (line.startsWith('[')) {
            isOriginBlock = line === '[remote "origin"]'
            continue
        }

        if (!isOriginBlock || !line.startsWith('url =')) {
            continue
        }

        return line.slice('url ='.length).trim()
    }

    return ''
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

function getFirstUserMessage(data: GeminiSessionFile) {
    return data.messages
        ?.filter(message => message.type === 'user')
        .map(message => extractMessageText(message.content))
        .find(Boolean) ?? ''
}

function extractMessageText(content: GeminiSessionMessage['content']) {
    if (typeof content === 'string') {
        return content
    }

    if (!Array.isArray(content)) {
        return ''
    }

    return content
        .map(item => item.text?.trim())
        .filter(Boolean)
        .join('\n')
}

function getThreadName(message: string, summary: string | undefined, project: string) {
    const firstLine = message
        .split('\n')
        .map(line => line.trim())
        .find(line => line && !line.startsWith('<'))
        ?? summary?.trim()

    if (!firstLine) {
        return `Session for ${project}`
    }

    return firstLine.length > 96 ? `${firstLine.slice(0, 93)}...` : firstLine
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
    const parts = new Intl.DateTimeFormat('en-CA', {
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
    return Array.from(new Set(items.filter(Boolean)))
}

function roundCurrency(value: number) {
    return Math.round(value * 1_000_000) / 1_000_000
}
