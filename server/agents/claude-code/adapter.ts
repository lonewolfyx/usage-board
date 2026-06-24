import type { AgentAdapter, UsageInteractionFact, UsageSourceFile } from '#server/agents/shared/fact'
import type { IConfig } from '#shared/types/config'
import type { ClaudeLineRaw, ClaudeMessageRaw } from './types'
import { Buffer } from 'node:buffer'
import { discoverSourceFiles, readJsonlObjects } from '#server/agents/shared/io'
import { createInteractionUsage } from '#server/agents/shared/usage'
import {
    decodeClaudeProjectPath,
    extractClaudeProjectFromPath,
    getClaudeLookupCandidates,
    getProjectName,
    toIsoString,
} from '#shared/utils/platform'

const CLAUDE_USAGE_MARKER = Buffer.from('"usage"')

export class ClaudeCodeAdapter implements AgentAdapter {
    readonly platform = 'claudeCode' as const
    private readonly patterns: string[]

    constructor(config: IConfig) {
        this.patterns = config.claudeCodePaths.map(path => `${path.replace(/\/$/u, '')}/projects/**/*.jsonl`)
    }

    discoverSources() {
        return discoverSourceFiles(this.platform, this.patterns)
    }

    async loadSource(source: UsageSourceFile) {
        return { facts: loadClaudeCodeFacts(source), source }
    }

    watchSourcePatterns() {
        return this.patterns
    }
}

function loadClaudeCodeFacts(source: UsageSourceFile): UsageInteractionFact[] {
    const lines = readJsonlObjects<ClaudeLineRaw>(source.path, CLAUDE_USAGE_MARKER)
    const facts: UsageInteractionFact[] = []
    const projectPath = extractClaudeProjectFromPath(source.path)
    const sourceSessionId = extractClaudeSessionIdFromPath(source.path)

    for (let index = 0; index < lines.length; index += 1) {
        const normalized = normalizeClaudeLine(lines[index]!)

        if (!normalized) {
            continue
        }

        const displayModel = normalized.model
            ? normalized.speed === 'fast'
                ? `${normalized.model}-fast`
                : normalized.model
            : null
        const usage = createInteractionUsage({
            cacheCreation1hTokens: normalized.usage.cache_creation?.ephemeral_1h_input_tokens ?? undefined,
            cacheCreation5mTokens: normalized.usage.cache_creation?.ephemeral_5m_input_tokens ?? undefined,
            cacheCreationTokens: normalized.usage.cache_creation_input_tokens ?? undefined,
            cacheReadTokens: normalized.usage.cache_read_input_tokens ?? undefined,
            inputTokens: normalized.usage.input_tokens,
            outputTokens: normalized.usage.output_tokens,
        })

        // NOTE: zero-usage rows are intentionally kept. Claude Code streams incremental
        // usage for one assistant message across multiple lines sharing the same message
        // id; a main (non-sidechain) placeholder is often zero-usage while the matching
        // sidechain row carries the tokens. ccusage keeps these zero rows through dedup so
        // the non-sidechain rule can drop the sidechain tokens. Filtering them here would
        // over-count vs ccusage. dedupeFacts collapses them back to one winner.
        const project = getProjectName(normalized.cwd, '') || decodeClaudeProjectPath(projectPath)

        facts.push({
            dedupeKey: normalized.messageId ? `${normalized.messageId}:${normalized.requestId ?? ''}` : null,
            fallbackDedupeKey: normalized.messageId,
            hasSpeed: normalized.hasSpeed,
            interactionIndex: index,
            isSidechain: normalized.isSidechain,
            model: displayModel,
            modelLookupCandidates: displayModel ? getClaudeLookupCandidates(displayModel) : [],
            platform: 'claudeCode',
            project,
            provider: 'anthropic',
            rawCostUSD: normalized.costUSD,
            repository: `local/${project}`,
            role: normalized.role,
            sessionId: normalized.sessionId ?? sourceSessionId,
            sourceFile: source.path,
            sourceFileMtime: source.mtimeMs,
            speed: normalized.speed,
            threadName: `Session for ${project}`,
            timestamp: normalized.timestamp,
            type: normalized.type,
            usage,
        })
    }

    return facts
}

interface NormalizedClaudeLine {
    costUSD: number | null
    cwd: string
    hasSpeed: boolean
    isSidechain: boolean
    messageId: string | null
    model: string | null
    requestId: string | undefined
    role: string
    sessionId: string | undefined
    speed: 'fast' | 'standard'
    timestamp: string
    type: string
    usage: ClaudeMessageRaw['usage'] & {
        input_tokens: number
        output_tokens: number
    }
}

function normalizeClaudeLine(line: ClaudeLineRaw): NormalizedClaudeLine | null {
    const progressMessage = line.data?.message
    const message = line.message?.usage ? line.message : progressMessage?.message
    const isProgressLine = message === progressMessage?.message
    const usage = message?.usage

    if (!message || !usage || hasUnsupportedClaudeNullField(line, progressMessage ?? null, message, usage)) {
        return null
    }

    if (!isProgressLine && line.version != null && (typeof line.version !== 'string' || !/^\d+\.\d+\.\d+/u.test(line.version))) {
        return null
    }

    if (!isProgressLine && line.sessionId != null && (typeof line.sessionId !== 'string' || line.sessionId === '')) {
        return null
    }

    const rawRequestId = isProgressLine ? progressMessage?.requestId : line.requestId
    if (rawRequestId != null && (typeof rawRequestId !== 'string' || rawRequestId === '')) {
        return null
    }

    if (message.id != null && (typeof message.id !== 'string' || message.id === '')) {
        return null
    }

    if (message.model != null && (typeof message.model !== 'string' || message.model === '')) {
        return null
    }

    if (typeof usage.input_tokens !== 'number' || !Number.isFinite(usage.input_tokens)
        || typeof usage.output_tokens !== 'number' || !Number.isFinite(usage.output_tokens)) {
        return null
    }

    const rawCostUSD = isProgressLine ? progressMessage?.costUSD : line.costUSD
    if (rawCostUSD != null && (typeof rawCostUSD !== 'number' || !Number.isFinite(rawCostUSD))) {
        return null
    }

    const timestamp = toIsoString(isProgressLine ? progressMessage?.timestamp : line.timestamp)

    if (!timestamp) {
        return null
    }

    const role = typeof message.role === 'string' && message.role ? message.role : 'assistant'
    const type = typeof message.type === 'string' && message.type ? message.type : 'message'

    return {
        costUSD: rawCostUSD ?? null,
        cwd: typeof line.cwd === 'string' ? line.cwd.trim() : '',
        hasSpeed: usage.speed === 'fast' || usage.speed === 'standard',
        isSidechain: (isProgressLine ? progressMessage?.isSidechain : line.isSidechain) === true,
        messageId: typeof message.id === 'string' ? message.id : null,
        model: typeof message.model === 'string' && message.model !== '<synthetic>' ? message.model : null,
        requestId: rawRequestId ?? undefined,
        role,
        sessionId: !isProgressLine && typeof line.sessionId === 'string' ? line.sessionId : undefined,
        speed: usage.speed === 'fast' ? 'fast' : 'standard',
        timestamp,
        type,
        usage: {
            ...usage,
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
        },
    }
}

function hasUnsupportedClaudeNullField(
    line: ClaudeLineRaw,
    progressMessage: NonNullable<NonNullable<ClaudeLineRaw['data']>['message']> | null,
    message: ClaudeMessageRaw,
    usage: NonNullable<ClaudeMessageRaw['usage']>,
) {
    return line.cwd === null
        || line.costUSD === null
        || progressMessage?.costUSD === null
        || line.version === null
        || line.sessionId === null
        || line.requestId === null
        || progressMessage?.requestId === null
        || line.isApiErrorMessage === null
        || message.id === null
        || message.model === null
        || usage.speed === null
        || usage.cache_read_input_tokens === null
        || usage.cache_creation_input_tokens === null
}

function extractClaudeSessionIdFromPath(filePath: string) {
    const parts = filePath.replace(/\\/gu, '/').split('/').filter(Boolean)
    const projectsIndex = parts.findIndex(part => part === 'projects')
    const relative = projectsIndex === -1 ? parts : parts.slice(projectsIndex + 1)
    const fileName = relative.at(-1) ?? ''
    const fileSessionId = fileName.endsWith('.jsonl') ? fileName.slice(0, -'.jsonl'.length) : ''

    if (relative.length === 2 && fileSessionId) {
        return fileSessionId
    }

    if (relative.length >= 4 && relative.at(-2) === 'subagents') {
        return relative.at(-3) || 'unknown'
    }

    return relative.at(-2) || fileSessionId || 'unknown'
}
