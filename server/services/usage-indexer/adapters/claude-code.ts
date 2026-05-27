import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import type { ModelPricingResolver } from '#shared/types/platform'
import type { ProjectInteractionUsage } from '#shared/types/usage-dashboard'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
    CLAUDE_MODEL_ALIASES,
} from '#shared/platform/constant'
import { calculateUsageCostUSD, createLiteLLMPricingResolver } from '#shared/platform/pricing'
import {
    normalizeFiniteNumberOrNull,
    normalizeStringValue,
    normalizeUnknownRecord,
} from '#shared/utils/normalize'
import {
    decodeClaudeProjectPath,
    extractClaudeProjectFromPath,
    getClaudeLookupCandidates,
    getProjectName,
    parseJsonlFile,
    toIsoString,
} from '#shared/utils/platform'
import { normalizeNumber } from '#shared/utils/usage-dashboard'
import { glob } from 'glob'
import {
    addFragmentInteraction,
    createSessionFragment,
    normalizeRole,
    toDiscoveredUsageFile,
} from '../session-fragment'

const CLAUDE_CODE_CACHE_SIGNATURE = 'claude-code-dedupe:daily-agent-progress-v2'

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
        const lines = parseJsonlFile<Record<string, unknown>>(filePath)
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
            const message = line.message
            const usageRecord = line.usage
            const model = getClaudeDisplayModel(line)
            const usage = usageRecord
                ? getClaudeInteractionUsage(usageRecord, model, resolvePricing, line.costUSD)
                : null
            const key = `${project}:${sessionId}`
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
                fallbackDedupeKey: normalizeStringValue(message?.id),
                index,
                isSidechain: line.isSidechain === true,
                model: model ?? null,
                role: getInteractionRole(line.type, message),
                timestamp,
                type: line.type ?? (normalizeStringValue(message?.type) || 'message'),
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
    usage: Record<string, unknown>,
    model: string | undefined,
    resolvePricing: ModelPricingResolver,
    costUSD: number | null,
): ProjectInteractionUsage {
    const cacheCreationTokens = normalizeNumber(usage.cache_creation_input_tokens)
    const cacheReadTokens = normalizeNumber(usage.cache_read_input_tokens)
    const inputTokens = normalizeNumber(usage.input_tokens)
    const outputTokens = normalizeNumber(usage.output_tokens)
    const resolvedCostUSD = costUSD ?? (model
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
        costUSD: resolvedCostUSD,
        inputTokens,
        outputTokens,
        reasoningOutputTokens: 0,
        totalTokens: inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens,
    }
}

function getClaudeDisplayModel(line: ClaudeUsageLine) {
    const model = normalizeStringValue(line.message.model)

    if (!model) {
        return undefined
    }

    return line.usage.speed === 'fast' ? `${model}-fast` : model
}

function getClaudeUniqueHash(line: ClaudeUsageLine) {
    const messageId = normalizeStringValue(line.message.id)
    const requestId = line.requestId

    return messageId ? `${messageId}:${requestId ?? ''}` : null
}

function extractClaudeMessageText(content: unknown) {
    if (typeof content === 'string') {
        return content
    }

    if (!Array.isArray(content)) {
        return ''
    }

    return content
        .map(item => typeof item === 'object' && item ? normalizeStringValue((item as Record<string, unknown>).text) ?? '' : '')
        .filter(Boolean)
        .join('\n')
}

function getInteractionRole(type: string | undefined, message: Record<string, unknown>) {
    const role = normalizeStringValue(message.role) || type || normalizeStringValue(message.type) || ''

    return normalizeRole(role)
}

interface ClaudeUsageLine {
    costUSD: number | null
    cwd: string | undefined
    isSidechain: boolean | undefined
    message: Record<string, unknown>
    requestId: string | undefined
    sessionId: string | undefined
    timestamp: string | null
    type: string | undefined
    usage: Record<string, unknown>
}

function getClaudeUsageLine(line: Record<string, unknown>): ClaudeUsageLine | null {
    const progressData = normalizeUnknownRecord(line.data)
    const progressMessage = normalizeUnknownRecord(progressData?.message)
    const message = normalizeUnknownRecord(progressMessage?.message) ?? normalizeUnknownRecord(line.message)
    const usage = normalizeUnknownRecord(message?.usage)

    if (!message || !usage || hasUnsupportedClaudeNullField(line, progressMessage, message, usage)) {
        return null
    }

    const version = normalizeStringValue(line.version)

    if (version && !/^\d+\.\d+\.\d+/u.test(version)) {
        return null
    }

    const sessionId = normalizeStringValue(line.sessionId)
    const requestId = normalizeStringValue(progressMessage?.requestId) ?? normalizeStringValue(line.requestId)

    if (hasEmptyClaudeField({
        message,
        requestId,
        sessionId,
        version,
    })) {
        return null
    }

    return {
        costUSD: normalizeFiniteNumberOrNull(progressMessage?.costUSD) ?? normalizeFiniteNumberOrNull(line.costUSD),
        cwd: normalizeStringValue(line.cwd),
        isSidechain: normalizeBooleanValue(progressMessage?.isSidechain ?? line.isSidechain),
        message,
        requestId,
        sessionId,
        timestamp: toIsoString(progressMessage?.timestamp ?? line.timestamp) ?? null,
        type: normalizeStringValue(progressMessage?.type) ?? normalizeStringValue(line.type),
        usage,
    }
}

function hasUnsupportedClaudeNullField(
    line: Record<string, unknown>,
    progressMessage: Record<string, unknown> | null,
    message: Record<string, unknown>,
    usage: Record<string, unknown>,
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

function hasEmptyClaudeField(options: {
    message: Record<string, unknown>
    requestId: string | undefined
    sessionId: string | undefined
    version: string | undefined
}) {
    const candidates = [
        options.sessionId,
        options.requestId,
        options.version,
        options.message.id,
        options.message.model,
    ]

    return candidates.some(value => typeof value === 'string' && value.trim() === '')
}

function normalizeBooleanValue(value: unknown) {
    if (value === true || value === false) {
        return value
    }

    return undefined
}
