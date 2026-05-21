import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import type { ModelPricingResolver } from '#shared/types/platform'
import type { ProjectInteractionRole, ProjectInteractionUsage } from '#shared/types/usage-dashboard'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
    CLAUDE_FALLBACK_MODEL,
    CLAUDE_MODEL_ALIASES,
} from '#shared/platform/constant'
import { calculateUsageCostUSD, createLiteLLMPricingResolver } from '#shared/platform/pricing'
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
    getRecord,
    getString,
    normalizeOptionalNumber,
    normalizeRole,
    toDiscoveredUsageFile,
} from '../session-fragment'

export const claudeCodeUsageAdapter = {
    async createPricingResolver() {
        return createLiteLLMPricingResolver({
            aliases: CLAUDE_MODEL_ALIASES,
            fallbackModel: CLAUDE_FALLBACK_MODEL,
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
            .flatMap(filePath => toDiscoveredUsageFile(filePath, 'claudeCode'))
    },
    parseFile(filePath, resolvePricing) {
        const projectPath = extractClaudeProjectFromPath(filePath)
        const fallbackSessionId = basename(filePath, '.jsonl')
        const lines = parseJsonlFile<Record<string, unknown>>(filePath)
        const fragments = new Map<string, ReturnType<typeof createSessionFragment>>()

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
    },
    watchPatterns(config) {
        return config.claudeCodePaths.map(path => join(path, 'projects', '**', '*.jsonl'))
    },
} satisfies UsagePlatformAdapter

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

function getInteractionRole(line: Record<string, unknown>, message: Record<string, unknown> | null): ProjectInteractionRole {
    const role = getString(line.type) || getString(message?.role) || getString(message?.type)

    return normalizeRole(role)
}

function normalizeNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
