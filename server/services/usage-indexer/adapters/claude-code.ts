import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import type { ModelPricingResolver } from '#shared/types/platform'
import type { ProjectInteractionUsage } from '#shared/types/usage-dashboard'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
    CLAUDE_MODEL_ALIASES,
} from '#shared/platform/constant'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
import {
    decodeClaudeProjectPath,
    extractClaudeProjectFromPath,
    getClaudeLookupCandidates,
    getProjectName,
    parseJsonlFile,
    toIsoString,
} from '#shared/utils/platform'
import { glob } from 'glob'
import {
    addFragmentInteraction,
    createSessionFragment,
    normalizeRole,
    toDiscoveredUsageFile,
} from '../session-fragment'

const CLAUDE_CODE_CACHE_SIGNATURE = 'claude-code-dedupe:assistant-message-v3'

export const claudeCodeUsageAdapter = {
    async createPricingResolver() {
        return createLiteLLMPricingResolver({
            aliases: CLAUDE_MODEL_ALIASES,
            getLookupCandidates: getClaudeLookupCandidates,
        })
    },
    async discoverFiles(config) {
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
            .flatMap(filePath => toDiscoveredUsageFile(filePath, 'claudeCode', CLAUDE_CODE_CACHE_SIGNATURE))
    },
    parseFile(filePath, resolvePricing) {
        const projectPath = extractClaudeProjectFromPath(filePath)
        const fallbackSessionId = basename(filePath, '.jsonl')
        const lines = parseJsonlFile<Record<string, any>>(filePath)
        const fragments = new Map<string, ReturnType<typeof createSessionFragment>>()

        for (let index = 0; index < lines.length; index += 1) {
            const line = getClaudeUsageLine(lines[index]!)

            if (!line) {
                continue
            }

            const sessionId = line.sessionId || fallbackSessionId
            const cwd = line.cwd ?? ''
            const project = getProjectName(cwd, '') || decodeClaudeProjectPath(projectPath)
            const timestamp = line.timestamp
            const usageRecord = line.usage
            const model = getClaudeDisplayModel(line)
            const usage = usageRecord
                ? getClaudeInteractionUsage(usageRecord, model, resolvePricing, line.costUSD)
                : null
            const messageId = line.message.id
            const messageRole = typeof line.message.role === 'string' ? line.message.role : ''
            const messageType = typeof line.message.type === 'string' ? line.message.type : ''
            const key = `${project}:${sessionId}`
            const fragment = fragments.get(key) ?? createSessionFragment({
                project,
                repository: `local/${project}`,
                sessionId,
                startedAt: timestamp,
                threadName: `Session for ${project}`,
            })

            addFragmentInteraction(fragment, {
                costUSD: usage?.costUSD ?? 0,
                dedupeKey: getClaudeUniqueHash(line),
                fallbackDedupeKey: messageId || undefined,
                index,
                isSidechain: line.isSidechain === true,
                model: model ?? null,
                rawCostUSD: line.costUSD,
                role: normalizeRole(messageRole || line.type || messageType || ''),
                speed: line.usage.speed === 'fast' ? 'fast' : 'standard',
                timestamp,
                type: line.type || messageType || 'message',
                usage,
            })
            fragments.set(key, fragment)
        }

        return Array.from(fragments.values())
    },
    watchPatterns(config) {
        return config.claudeCodePaths.map(path => join(path, 'projects', '**', '*.jsonl'))
    },
} satisfies UsagePlatformAdapter

function getClaudeInteractionUsage(
    usage: Record<string, any>,
    model: string | undefined,
    resolvePricing: ModelPricingResolver,
    costUSD: number | null,
): ProjectInteractionUsage {
    void model
    void resolvePricing
    const cacheCreationTokens = typeof usage.cache_creation_input_tokens === 'number' && Number.isFinite(usage.cache_creation_input_tokens)
        ? Math.max(0, Math.trunc(usage.cache_creation_input_tokens))
        : 0
    const cacheReadTokens = typeof usage.cache_read_input_tokens === 'number' && Number.isFinite(usage.cache_read_input_tokens)
        ? Math.max(0, Math.trunc(usage.cache_read_input_tokens))
        : 0
    const inputTokens = typeof usage.input_tokens === 'number' && Number.isFinite(usage.input_tokens)
        ? Math.max(0, Math.trunc(usage.input_tokens))
        : 0
    const outputTokens = typeof usage.output_tokens === 'number' && Number.isFinite(usage.output_tokens)
        ? Math.max(0, Math.trunc(usage.output_tokens))
        : 0

    return {
        cacheCreationTokens,
        cacheReadTokens,
        cachedInputTokens: cacheCreationTokens + cacheReadTokens,
        costUSD: costUSD ?? 0,
        inputTokens,
        outputTokens,
        reasoningOutputTokens: 0,
        totalTokens: inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens,
    }
}

function getClaudeDisplayModel(line: ClaudeUsageLine) {
    const model = line.message.model

    if (!model) {
        return undefined
    }

    return line.usage.speed === 'fast' ? `${model}-fast` : model
}

function getClaudeUniqueHash(line: ClaudeUsageLine) {
    const messageId = line.message.id
    const requestId = line.requestId

    return messageId ? `${messageId}:${requestId ?? ''}` : null
}

interface ClaudeUsageLine {
    costUSD: number | null
    cwd: string | undefined
    isSidechain: boolean | undefined
    message: Record<string, any>
    requestId: string | undefined
    sessionId: string | undefined
    timestamp: string | null
    type: string | undefined
    usage: Record<string, any>
}

function getClaudeUsageLine(line: Record<string, any>): ClaudeUsageLine | null {
    const progressData = line.data
    const progressMessage = progressData?.message
    const message = progressMessage?.message ?? line.message
    const usage = message?.usage

    if (!message || !usage || hasUnsupportedClaudeNullField(line, progressMessage, message, usage)) {
        return null
    }

    const version = typeof line.version === 'string' ? line.version.trim() : ''

    if (version && !/^\d+\.\d+\.\d+/u.test(version)) {
        return null
    }

    const sessionId = typeof line.sessionId === 'string' ? line.sessionId.trim() : ''
    const requestId = typeof progressMessage?.requestId === 'string'
        ? progressMessage.requestId.trim()
        : typeof line.requestId === 'string'
            ? line.requestId.trim()
            : undefined
    const messageId = typeof message.id === 'string' ? message.id.trim() : ''
    const model = typeof message.model === 'string' ? message.model.trim() : ''
    const messageRole = typeof message.role === 'string' ? message.role.trim() : ''
    const messageType = typeof message.type === 'string' ? message.type.trim() : ''

    if (!version || !sessionId || !messageId || !model || messageRole !== 'assistant' || messageType !== 'message') {
        return null
    }

    const rawSidechain = progressMessage?.isSidechain ?? line.isSidechain
    const rawCostA = progressMessage?.costUSD
    const rawCostB = line.costUSD

    return {
        costUSD: (typeof rawCostA === 'number' && Number.isFinite(rawCostA) ? rawCostA : null) ?? (typeof rawCostB === 'number' && Number.isFinite(rawCostB) ? rawCostB : null),
        cwd: typeof line.cwd === 'string' ? line.cwd.trim() : undefined,
        isSidechain: rawSidechain === true || rawSidechain === false ? rawSidechain : undefined,
        message: {
            ...message,
            id: messageId,
            model,
            role: messageRole,
            type: messageType,
        },
        requestId,
        sessionId,
        timestamp: toIsoString(progressMessage?.timestamp ?? line.timestamp) ?? null,
        type: typeof progressMessage?.type === 'string'
            ? progressMessage.type.trim()
            : typeof line.type === 'string'
                ? line.type.trim()
                : undefined,
        usage,
    }
}

function hasUnsupportedClaudeNullField(
    line: Record<string, any>,
    progressMessage: Record<string, any> | null,
    message: Record<string, any>,
    usage: Record<string, any>,
) {
    return line.cwd === null
        || (progressMessage?.costUSD ?? line.costUSD) === null
        || line.version === null
        || line.sessionId === null
        || (progressMessage?.requestId ?? line.requestId) === null
        || line.isApiErrorMessage === null
        || message.id === null
        || message.model === null
        || usage.speed === null
        || usage.cache_read_input_tokens === null
        || usage.cache_creation_input_tokens === null
}
