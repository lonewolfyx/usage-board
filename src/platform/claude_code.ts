import type {
    LoadUsageResult,
    UsageSessionUsageItem,
    UsageTopModel,
    UsageTopProject,
} from '#shared/types/usage-dashboard'
import type {
    ClaudeAggregateEvent,
    ClaudeModelUsageSummary,
    ClaudeSessionSummary,
    ClaudeTokenTotals,
    ClaudeUsageEntry,
    ClaudeUsageRecord,
    DailyUsageSummaryGroup,
    IConfig,
    ModelPricingResolver,
    PeriodRowGroup,
    SessionAggregateGroup,
    TokenUsageDelta,
} from '~~/src/types'
import { existsSync, readFileSync } from 'node:fs'
import { basename, sep } from 'node:path'
import { glob } from 'glob'
import { calculateUsageCostUSD, createLiteLLMPricingResolver } from '~~/src/platform/pricing'

const CLAUDE_FALLBACK_MODEL = 'claude-sonnet-4-5'
const CLAUDE_MODEL_ALIASES: Record<string, string> = {
    'claude-3-5-haiku-latest': 'claude-haiku-4-5',
    'claude-3-5-sonnet-latest': 'claude-sonnet-4-5',
    'claude-3-7-sonnet-latest': 'claude-sonnet-4-5',
    'claude-haiku-4.5': 'claude-haiku-4-5',
    'claude-opus-4.1': 'claude-opus-4-1',
    'claude-sonnet-4.5': 'claude-sonnet-4-5',
    'claude-4-1-opus': 'claude-opus-4-1',
    'claude-4-5-haiku': 'claude-haiku-4-5',
    'claude-4-5-sonnet': 'claude-sonnet-4-5',
}

export const loadClaudeCodeUsage = async (config: IConfig): Promise<LoadUsageResult> => {
    const resolvePricing = await createLiteLLMPricingResolver({
        aliases: CLAUDE_MODEL_ALIASES,
        fallbackModel: CLAUDE_FALLBACK_MODEL,
        getLookupCandidates: getClaudeLookupCandidates,
    })
    const entries = await loadClaudeUsageEntries(config, resolvePricing)
    const sessionSummaries = buildClaudeSessionSummaries(entries)
        .sort((a, b) => Date.parse(b.lastActivity) - Date.parse(a.lastActivity))
    const sessionUsage = sessionSummaries.map(toClaudeSessionUsageItem)
    const events = entries.map(toClaudeAggregateEvent)

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
        cachedInputTokens: session.cacheCreationTokens + session.cacheReadTokens,
        outputTokens: session.outputTokens,
        reasoningOutputTokens: 0,
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

async function loadClaudeUsageEntries(config: IConfig, resolvePricing: ModelPricingResolver) {
    const claudePaths = getConfiguredClaudePaths(config)
    const files = await globClaudeUsageFiles(claudePaths)

    if (files.length === 0) {
        return []
    }

    const sortedFiles = sortFilesByTimestamp(files)
    const processedHashes = new Set<string>()
    const entries: ClaudeUsageEntry[] = []

    for (const filePath of sortedFiles) {
        const projectPath = extractProjectFromPath(filePath)
        const fallbackSessionId = basename(filePath, '.jsonl')
        const lines = parseJsonlFile(filePath)

        for (const line of lines) {
            if (!isClaudeUsageRecord(line)) {
                continue
            }

            const uniqueHash = createUniqueHash(line)

            if (uniqueHash != null && processedHashes.has(uniqueHash)) {
                continue
            }

            if (uniqueHash != null) {
                processedHashes.add(uniqueHash)
            }

            const usage = line.message.usage
            const rawModel = line.message.model?.trim()
            const model = getDisplayModelName(line) ?? 'unknown'
            const cacheCreationTokens = normalizeNumber(usage.cache_creation_input_tokens)
            const cacheReadTokens = normalizeNumber(usage.cache_read_input_tokens)
            const inputTokens = normalizeNumber(usage.input_tokens)
            const outputTokens = normalizeNumber(usage.output_tokens)
            const costUSD = line.costUSD ?? (rawModel
                ? calculateUsageCostUSD({
                        cacheCreationTokens,
                        cachedInputTokens: cacheReadTokens,
                        inputTokens,
                        outputTokens,
                    }, resolvePricing(rawModel), {
                        speed: usage.speed,
                    })
                : 0)

            entries.push({
                cacheCreationTokens,
                cacheReadTokens,
                costUSD,
                cwd: line.cwd,
                inputTokens,
                model,
                outputTokens,
                projectPath,
                rawModel,
                sessionId: line.sessionId?.trim() || fallbackSessionId,
                timestamp: new Date(line.timestamp).toISOString(),
            })
        }
    }

    return entries
}

function parseJsonlFile(filePath: string) {
    const content = readFileSync(filePath, 'utf8')

    if (!content.trim()) {
        return [] as unknown[]
    }

    const lines: unknown[] = []

    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim()

        if (!line) {
            continue
        }

        try {
            lines.push(JSON.parse(line))
        }
        catch {
            continue
        }
    }

    return lines
}

function getConfiguredClaudePaths(config: IConfig) {
    return config.claudeCodePaths?.length ? config.claudeCodePaths : [config.claudeCodePath]
}

async function globClaudeUsageFiles(claudePaths: string[]) {
    const fileGroups = await Promise.all(claudePaths.map(async (claudePath) => {
        const projectsDir = `${claudePath}/projects`

        if (!existsSync(projectsDir)) {
            return [] as string[]
        }

        return glob(`${claudePath}/projects/**/*.jsonl`, {
            absolute: true,
        }).catch(() => [])
    }))

    return fileGroups.flat()
}

function sortFilesByTimestamp(files: string[]) {
    return files
        .map(file => ({
            file,
            timestamp: getEarliestTimestamp(file),
        }))
        .sort((a, b) => {
            if (a.timestamp == null && b.timestamp == null) {
                return 0
            }
            if (a.timestamp == null) {
                return 1
            }
            if (b.timestamp == null) {
                return -1
            }

            return a.timestamp.getTime() - b.timestamp.getTime()
        })
        .map(item => item.file)
}

function getEarliestTimestamp(filePath: string) {
    for (const line of parseJsonlFile(filePath)) {
        if (!line || typeof line !== 'object') {
            continue
        }

        const timestamp = (line as Record<string, unknown>).timestamp

        if (typeof timestamp !== 'string') {
            continue
        }

        const date = new Date(timestamp)

        if (!Number.isNaN(date.getTime())) {
            return date
        }
    }

    return null
}

function isClaudeUsageRecord(value: unknown): value is ClaudeUsageRecord {
    if (!value || typeof value !== 'object') {
        return false
    }

    const record = value as Record<string, unknown>
    const message = record.message

    if (typeof record.timestamp !== 'string' || !message || typeof message !== 'object') {
        return false
    }

    const usage = (message as Record<string, unknown>).usage

    if (!usage || typeof usage !== 'object') {
        return false
    }

    const usageRecord = usage as Record<string, unknown>

    return typeof usageRecord.input_tokens === 'number'
        && typeof usageRecord.output_tokens === 'number'
        && Number.isFinite(Date.parse(record.timestamp))
}

function createUniqueHash(data: ClaudeUsageRecord) {
    const messageId = data.message.id
    const requestId = data.requestId

    if (messageId == null || requestId == null) {
        return null
    }

    return `${messageId}:${requestId}`
}

function getDisplayModelName(data: ClaudeUsageRecord) {
    const model = data.message.model?.trim()

    if (!model) {
        return undefined
    }

    return data.message.usage.speed === 'fast' ? `${model}-fast` : model
}

function extractProjectFromPath(jsonlPath: string) {
    const normalizedPath = jsonlPath.replace(/[/\\]/g, sep)
    const segments = normalizedPath.split(sep)
    const projectsIndex = segments.findIndex(segment => segment === 'projects')

    if (projectsIndex === -1 || projectsIndex + 1 >= segments.length) {
        return 'unknown'
    }

    return segments[projectsIndex + 1]?.trim() || 'unknown'
}

function buildClaudeSessionSummaries(entries: ClaudeUsageEntry[]) {
    const groups = new Map<string, ClaudeUsageEntry[]>()

    for (const entry of entries) {
        const key = `${entry.projectPath}/${entry.sessionId}`
        const group = groups.get(key) ?? []
        group.push(entry)
        groups.set(key, group)
    }

    return Array.from(groups.values()).map((sessionEntries) => {
        const sortedEntries = [...sessionEntries].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
        const firstEntry = sortedEntries[0]!
        const lastEntry = sortedEntries.at(-1)!
        const usageByModel = new Map<string, ClaudeModelUsageSummary>()
        let inputTokens = 0
        let cacheCreationTokens = 0
        let cacheReadTokens = 0
        let outputTokens = 0
        let costUSD = 0

        for (const entry of sortedEntries) {
            inputTokens += entry.inputTokens
            cacheCreationTokens += entry.cacheCreationTokens
            cacheReadTokens += entry.cacheReadTokens
            outputTokens += entry.outputTokens
            costUSD += entry.costUSD

            const modelUsage = usageByModel.get(entry.model) ?? {
                cacheCreationTokens: 0,
                cacheReadTokens: 0,
                cachedInputTokens: 0,
                costUSD: 0,
                inputTokens: 0,
                outputTokens: 0,
                reasoningOutputTokens: 0,
                totalTokens: 0,
            }
            modelUsage.cacheCreationTokens += entry.cacheCreationTokens
            modelUsage.cacheReadTokens += entry.cacheReadTokens
            modelUsage.cachedInputTokens += entry.cacheCreationTokens + entry.cacheReadTokens
            modelUsage.costUSD += entry.costUSD
            modelUsage.inputTokens += entry.inputTokens
            modelUsage.outputTokens += entry.outputTokens
            modelUsage.totalTokens += getTotalTokens(entry)
            usageByModel.set(entry.model, modelUsage)
        }

        const models = Array.from(usageByModel.keys())
            .filter(model => model !== '<synthetic>')
            .sort((a, b) => a.localeCompare(b))
        const topModel = Array.from(usageByModel.entries())
            .filter(([model]) => model !== '<synthetic>')
            .sort((a, b) => b[1].totalTokens - a[1].totalTokens || a[0].localeCompare(b[0]))[0]?.[0] ?? 'unknown'
        const project = getProjectName(firstEntry.cwd) || decodeClaudeProjectPath(firstEntry.projectPath)

        return {
            cacheCreationTokens,
            cacheReadTokens,
            costUSD: roundCurrency(costUSD),
            durationMinutes: getDurationMinutes(firstEntry.timestamp, lastEntry.timestamp),
            inputTokens,
            lastActivity: lastEntry.timestamp,
            models,
            outputTokens,
            project,
            repository: `local/${project}`,
            sessionId: firstEntry.sessionId,
            startedAt: firstEntry.timestamp,
            threadName: `Session for ${project}`,
            tokenTotal: getTotalTokens({
                cacheCreationTokens,
                cacheReadTokens,
                inputTokens,
                outputTokens,
            }),
            topModel,
        }
    })
}

function toClaudeSessionUsageItem(session: ClaudeSessionSummary): UsageSessionUsageItem {
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
        cachedInputTokens: session.cacheCreationTokens + session.cacheReadTokens,
        outputTokens: session.outputTokens,
        reasoningOutputTokens: 0,
        tokenTotal: session.tokenTotal,
        costUSD: session.costUSD,
    }
}

function toClaudeAggregateEvent(entry: ClaudeUsageEntry): ClaudeAggregateEvent {
    const project = getProjectName(entry.cwd) || decodeClaudeProjectPath(entry.projectPath)

    return {
        cacheCreationTokens: entry.cacheCreationTokens,
        cacheReadTokens: entry.cacheReadTokens,
        cachedInputTokens: entry.cacheCreationTokens + entry.cacheReadTokens,
        costUSD: entry.costUSD,
        inputTokens: entry.inputTokens,
        isFallbackModel: entry.model === 'unknown',
        model: entry.model,
        outputTokens: entry.outputTokens,
        project,
        reasoningOutputTokens: 0,
        repository: `local/${project}`,
        sessionId: entry.sessionId,
        timestamp: entry.timestamp,
        totalTokens: getTotalTokens(entry),
    }
}

function buildDailyUsageGroups(events: ClaudeAggregateEvent[]) {
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

        addEventToAggregateGroup(group, event)
        group.sessionIds.add(event.sessionId)
        group.sessionCount = group.sessionIds.size

        if (event.model !== '<synthetic>') {
            const modelUsage = group.modelUsage.get(event.model) ?? {
                ...createEmptyUsage(),
                isFallback: false,
            }
            addUsage(modelUsage, event)
            if (event.isFallbackModel) {
                modelUsage.isFallback = true
            }
            group.modelUsage.set(event.model, modelUsage)
        }
        groups.set(dateKey, group)
    }

    return groups
}

function buildPeriodRows(events: ClaudeAggregateEvent[], periodType: 'month' | 'week') {
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

function buildMonthlyModelUsage(events: ClaudeAggregateEvent[]) {
    const groups = new Map<string, {
        model: string
        month: string
        totalTokens: number
    }>()

    for (const event of events) {
        if (event.model === '<synthetic>') {
            continue
        }

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

function addEventToAggregateGroup(group: SessionAggregateGroup, event: ClaudeAggregateEvent) {
    group.inputTokens += event.inputTokens
    group.cachedInputTokens += event.cachedInputTokens
    group.outputTokens += event.outputTokens
    group.reasoningOutputTokens += event.reasoningOutputTokens
    group.totalTokens += event.totalTokens
    group.costUSD += event.costUSD
    group.models = event.model === '<synthetic>' ? group.models : uniqueItems([...group.models, event.model])
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

function buildProjectUsage(sessionUsage: UsageSessionUsageItem[]) {
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
    todayTopModel: UsageTopModel | null
    todayTopProject: UsageTopProject | null
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

function getTopProjectForDate(events: ClaudeAggregateEvent[]) {
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

function getTopModelForDate(events: ClaudeAggregateEvent[]) {
    const models = new Map<string, number>()

    for (const event of events) {
        if (event.model === '<synthetic>') {
            continue
        }

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

function getClaudeLookupCandidates(model: string) {
    const normalizedModel = model.trim()

    return [
        normalizedModel,
        normalizedModel.replace(/-fast$/u, ''),
        normalizedModel.replace(/^anthropic\//u, ''),
        `anthropic/${normalizedModel}`,
        normalizedModel.replace(/^claude-3-5-/u, 'claude-'),
        normalizedModel.replace(/^claude-3-7-/u, 'claude-'),
    ]
}

function getTotalTokens(tokens: ClaudeTokenTotals) {
    return tokens.inputTokens + tokens.outputTokens + tokens.cacheCreationTokens + tokens.cacheReadTokens
}

function getProjectName(cwd: string | undefined) {
    if (!cwd) {
        return ''
    }

    const parts = cwd.split('/').filter(Boolean)

    return parts.at(-1) ?? ''
}

function decodeClaudeProjectPath(projectPath: string) {
    const normalized = projectPath.replace(/^-/, '').replace(/-/g, '/')
    const parts = normalized.split('/').filter(Boolean)

    return parts.at(-1) ?? projectPath
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
    return Array.from(new Set(items))
}

function roundCurrency(value: number) {
    return Math.round(value * 1_000_000) / 1_000_000
}
