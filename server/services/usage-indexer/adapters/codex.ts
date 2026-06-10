import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import type { ModelPricingResolver, RawUsage } from '#shared/types/platform'
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
    CODEX_FALLBACK_MODEL,
    CODEX_MODEL_ALIASES,
} from '#shared/platform/constant'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
import { normalizeFiniteNumberOrNull, normalizeStringValue, normalizeUnknownRecord } from '#shared/utils/normalize'
import {
    convertCodexRawUsage,
    extractModelName,
    getProjectName,
    isOpenRouterFreeModel,
    isZeroUsage,
    normalizeRawUsage,
    normalizeRepositoryUrl,
    parseJsonlFile,
    subtractRawUsage,
    toIsoString,
} from '#shared/utils/platform'
import { glob } from 'glob'
import {
    addFragmentInteraction,
    createSessionFragment,
    normalizeRole,
    toDiscoveredUsageFile,
} from '../session-fragment'
import { getFileModifiedAtIso } from './shared'

const CODEX_SPEED_CACHE_PREFIX = 'codex-speed:'

export const codexUsageAdapter = {
    async createPricingResolver() {
        return createLiteLLMPricingResolver({
            aliases: CODEX_MODEL_ALIASES,
            isZeroCostModel: isOpenRouterFreeModel,
        })
    },
    async discoverFiles(config) {
        const sessionsDir = join(config.codexPath, 'sessions')

        if (!existsSync(sessionsDir)) {
            return []
        }

        const files = await glob('**/*.jsonl', {
            absolute: true,
            cwd: sessionsDir,
        })

        const cacheSignature = getCodexConfigSignature(config.codexPath)

        return files.flatMap(filePath => toDiscoveredUsageFile(filePath, 'codex', cacheSignature))
    },
    parseFile(filePath, resolvePricing, file) {
        const lines = parseJsonlFile<Record<string, unknown>>(filePath)
        const sessionMeta = normalizeUnknownRecord(lines.find(line => normalizeStringValue(line.type) === 'session_meta')?.payload)
        const sessionId = getSessionId(filePath, normalizeStringValue(sessionMeta?.id))
        const startedAt = getCodexTimestamp(sessionMeta) ?? lines.map(line => getCodexTimestamp(line)).find(Boolean) ?? getFileModifiedAtIso(filePath)
        const project = getProjectName(normalizeStringValue(sessionMeta?.cwd) ?? '')
        const repository = normalizeRepositoryUrl(normalizeStringValue(normalizeUnknownRecord(sessionMeta?.git)?.repository_url)) || `local/${project}`
        const fragment = createSessionFragment({
            project,
            repository,
            sessionId,
            startedAt,
            threadName: `Session for ${project}`,
        })
        const speed = getCodexSpeedFromSignature(file.cacheSignature)
        let previousTotals: RawUsage | null = null
        let currentModel: string | undefined
        let currentModelIsFallback = false

        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index]!
            const payload = normalizeUnknownRecord(line.payload)

            if (normalizeStringValue(line.type) === 'turn_context') {
                const contextModel = extractModelName(payload)

                if (contextModel) {
                    currentModel = contextModel
                    currentModelIsFallback = false
                }
            }

            const timestamp = getCodexTimestamp(line) ?? getFileModifiedAtIso(filePath)
            const extractedModel = extractCodexModel(line)

            if (extractedModel) {
                currentModel = extractedModel
                currentModelIsFallback = false
            }

            const rawUsage = getCodexRawUsage(line, previousTotals)
            const totalUsage = normalizeRawUsage(normalizeUnknownRecord(payload?.info)?.total_token_usage as RawUsage | null | undefined)

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

            const effectiveType = normalizeStringValue(payload?.type) || normalizeStringValue(line.type) || 'event'

            if (effectiveType !== 'token_count') {
                continue
            }

            const usage = rawUsage
                ? getCodexInteractionUsage(rawUsage, model ?? CODEX_FALLBACK_MODEL, resolvePricing, speed)
                : null

            addFragmentInteraction(fragment, {
                costUSD: usage?.costUSD ?? 0,
                dedupeKey: usage && timestamp
                    ? getCodexDedupeKey(sessionId, timestamp, model ?? CODEX_FALLBACK_MODEL, usage)
                    : null,
                index,
                model: model ?? null,
                rawCostUSD: null,
                role: getCodexRole(line, rawUsage !== null),
                speed,
                timestamp,
                type: effectiveType,
                usage: usage ? { ...usage, isFallbackModel } : null,
            })
        }

        return [fragment]
    },
    watchPatterns(config) {
        return [
            join(config.codexPath, 'config.toml'),
            join(config.codexPath, 'sessions', '**', '*.jsonl'),
        ]
    },
} satisfies UsagePlatformAdapter

function getCodexRawUsage(line: Record<string, unknown>, previousTotals: RawUsage | null) {
    const payload = normalizeUnknownRecord(line.payload)

    if (normalizeStringValue(line.type) === 'event_msg' && normalizeStringValue(payload?.type) === 'token_count') {
        const info = normalizeUnknownRecord(payload?.info)
        const lastUsage = normalizeRawUsage(info?.last_token_usage as RawUsage | null | undefined)
        const totalUsage = normalizeRawUsage(info?.total_token_usage as RawUsage | null | undefined)
        const sessionUsage = lastUsage ?? (totalUsage ? subtractRawUsage(totalUsage, previousTotals) : null)

        return sessionUsage
            && sessionUsage.input_tokens === 0
            && sessionUsage.cached_input_tokens === 0
            && sessionUsage.output_tokens === 0
            && sessionUsage.reasoning_output_tokens === 0
            ? null
            : sessionUsage
    }

    return getHeadlessCodexRawUsage(line)
}

function getCodexInteractionUsage(
    rawUsage: RawUsage,
    model: string,
    resolvePricing: ModelPricingResolver,
    speed: 'fast' | 'standard',
) {
    void model
    void resolvePricing
    void speed
    const usage = convertCodexRawUsage(rawUsage)

    if (isZeroUsage(usage)) {
        return null
    }

    return {
        ...usage,
        costUSD: 0,
    }
}

function getCodexConfigSignature(codexPath: string) {
    return `${CODEX_SPEED_CACHE_PREFIX}${readCodexConfigSpeed(getCodexConfigPath(codexPath))}`
}

function getCodexConfigPath(codexPath: string) {
    return join(codexPath, 'config.toml')
}

function readCodexConfigSpeed(configPath: string): 'fast' | 'standard' {
    try {
        return parseCodexConfigSpeed(readFileSync(configPath, 'utf8')) ?? 'standard'
    }
    catch {
        return 'standard'
    }
}

function getCodexSpeedFromSignature(cacheSignature: string): 'fast' | 'standard' {
    return cacheSignature === `${CODEX_SPEED_CACHE_PREFIX}fast` ? 'fast' : 'standard'
}

const CODEX_CONFIG_ASSIGNMENT_REGEX = /^\s*([a-z_][\w-]*)\s*=\s*["']([^"']+)["']\s*(?:#.*)?$/i
const CODEX_CONFIG_SECTION_REGEX = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/

function parseCodexConfigSpeed(content: string): 'fast' | 'standard' | undefined {
    let activeProfile: string | undefined
    let currentSection: string | null = null
    let topLevelSpeed: 'fast' | 'standard' | undefined
    const profileSpeeds = new Map<string, 'fast' | 'standard'>()

    for (const rawLine of content.split('\n')) {
        const sectionMatch = rawLine.match(CODEX_CONFIG_SECTION_REGEX)

        if (sectionMatch) {
            currentSection = sectionMatch[1]!.trim()
            continue
        }

        const match = rawLine.match(CODEX_CONFIG_ASSIGNMENT_REGEX)

        if (!match) {
            continue
        }

        const key = match[1]!
        const value = match[2]!.trim()

        if (!currentSection) {
            if (key === 'profile') {
                activeProfile = value
            }
            else if (key === 'service_tier') {
                topLevelSpeed = toCodexSpeed(value)
            }

            continue
        }

        const profileName = getCodexProfileName(currentSection)

        if (profileName && key === 'service_tier') {
            profileSpeeds.set(profileName, toCodexSpeed(value))
        }
    }

    return (activeProfile ? profileSpeeds.get(activeProfile) : undefined) ?? topLevelSpeed
}

function getCodexProfileName(section: string) {
    if (!section.startsWith('profiles.')) {
        return null
    }

    return stripTomlQuotes(section.slice('profiles.'.length).trim())
}

function stripTomlQuotes(value: string) {
    const quote = value[0]

    return quote && (quote === '"' || quote === '\'') && value.endsWith(quote)
        ? value.slice(1, -1)
        : value
}

function toCodexSpeed(value: string): 'fast' | 'standard' {
    const normalized = value.trim().toLowerCase()

    return normalized === 'priority' || normalized === 'fast' ? 'fast' : 'standard'
}

function getCodexRole(line: Record<string, unknown>, hasUsage: boolean) {
    const type = normalizeStringValue(normalizeUnknownRecord(line.payload)?.type) || normalizeStringValue(line.type) || ''

    if (type === 'token_count' || hasUsage) {
        return 'usage'
    }

    return normalizeRole(type)
}

function getSessionId(filePath: string, sessionMetaId: string | undefined) {
    return sessionMetaId?.trim() || basename(filePath, '.jsonl')
}

function getHeadlessCodexRawUsage(line: Record<string, unknown>) {
    const usage = getHeadlessUsageRecord(line)

    if (!usage) {
        return null
    }

    const normalizedUsage = readHeadlessCodexUsage(usage)

    return normalizedUsage && normalizedUsage.total_tokens > 0
        ? normalizedUsage
        : normalizedUsage && (normalizedUsage.input_tokens > 0 || normalizedUsage.cached_input_tokens > 0 || normalizedUsage.output_tokens > 0 || normalizedUsage.reasoning_output_tokens > 0)
            ? normalizedUsage
            : null
}

function getHeadlessUsageRecord(line: Record<string, unknown>) {
    const candidates = [
        normalizeUnknownRecord(line.usage),
        normalizeUnknownRecord(normalizeUnknownRecord(line.data)?.usage),
        normalizeUnknownRecord(normalizeUnknownRecord(line.result)?.usage),
        normalizeUnknownRecord(normalizeUnknownRecord(line.response)?.usage),
    ]

    return candidates.find(Boolean) ?? null
}

function readHeadlessCodexUsage(usage: Record<string, unknown>): RawUsage | null {
    const hasStandardUsageField = [
        'input_tokens',
        'cached_input_tokens',
        'cache_read_input_tokens',
        'output_tokens',
        'reasoning_output_tokens',
        'total_tokens',
    ].some(key => usage[key] !== undefined && usage[key] !== null)

    if (hasStandardUsageField) {
        const normalized = normalizeRawUsage(usage as unknown as RawUsage)

        if (normalized) {
            return normalized
        }
    }

    const inputTokens = Math.max(
        0,
        Math.trunc(normalizeFiniteNumberOrNull(usage.input_tokens) ?? normalizeFiniteNumberOrNull(usage.prompt_tokens) ?? 0),
    )
    const cachedInputTokens = Math.max(
        0,
        Math.trunc(normalizeFiniteNumberOrNull(usage.cached_input_tokens) ?? normalizeFiniteNumberOrNull(usage.cached_tokens) ?? 0),
    )
    const outputTokens = Math.max(
        0,
        Math.trunc(normalizeFiniteNumberOrNull(usage.output_tokens) ?? normalizeFiniteNumberOrNull(usage.completion_tokens) ?? 0),
    )
    const reasoningOutputTokens = Math.max(0, Math.trunc(normalizeFiniteNumberOrNull(usage.reasoning_output_tokens) ?? 0))
    const totalTokens = Math.max(0, Math.trunc(normalizeFiniteNumberOrNull(usage.total_tokens) ?? 0))

    return {
        cached_input_tokens: cachedInputTokens,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        reasoning_output_tokens: reasoningOutputTokens,
        total_tokens: totalTokens > 0 ? totalTokens : inputTokens + outputTokens + reasoningOutputTokens,
    }
}

function extractCodexModel(line: Record<string, unknown>) {
    const payload = normalizeUnknownRecord(line.payload)
    const candidates = [
        payload,
        line,
        normalizeUnknownRecord(line.data),
        normalizeUnknownRecord(line.result),
        normalizeUnknownRecord(line.response),
    ]

    for (const candidate of candidates) {
        const model = extractModelName(candidate)

        if (model) {
            return model
        }
    }

    return undefined
}

function getCodexTimestamp(line: Record<string, unknown> | null | undefined) {
    if (!line) {
        return null
    }

    const data = normalizeUnknownRecord(line.data)
    const result = normalizeUnknownRecord(line.result)
    const response = normalizeUnknownRecord(line.response)
    const payload = normalizeUnknownRecord(line.payload)

    return toIsoString(line.timestamp)
        || toIsoString(line.created_at)
        || toIsoString(line.createdAt)
        || toIsoString(payload?.timestamp)
        || toIsoString(data?.timestamp)
        || toIsoString(data?.created_at)
        || toIsoString(data?.createdAt)
        || toIsoString(result?.timestamp)
        || toIsoString(result?.created_at)
        || toIsoString(result?.createdAt)
        || toIsoString(response?.timestamp)
        || toIsoString(response?.created_at)
        || toIsoString(response?.createdAt)
}

function getCodexDedupeKey(sessionId: string, timestamp: string, model: string, usage: { cachedInputTokens: number, inputTokens: number, outputTokens: number, reasoningOutputTokens: number, totalTokens: number }) {
    const rawInputTokens = usage.inputTokens + usage.cachedInputTokens

    return [
        'codex',
        sessionId,
        timestamp,
        model,
        String(rawInputTokens),
        String(usage.cachedInputTokens),
        String(usage.outputTokens),
        String(usage.reasoningOutputTokens),
        String(usage.totalTokens),
    ].join(':')
}
