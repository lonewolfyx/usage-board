import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import type { RawUsage } from '#shared/types/platform'
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
    CODEX_FALLBACK_MODEL,
    CODEX_MODEL_ALIASES,
} from '#shared/platform/constant'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
import {
    convertCodexRawUsage,
    extractModelName,
    getProjectName,
    isOpenRouterFreeModel,
    isZeroUsage,
    normalizeRawUsage,
    normalizeRepositoryUrl,
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
import { getFileModifiedAtIso } from './shared'

const CODEX_SPEED_CACHE_PREFIX = 'codex-speed:'

interface CodexUsageContainer {
    created_at?: string | number
    createdAt?: string | number
    model?: string
    model_name?: string
    timestamp?: string | number
    usage?: CodexHeadlessUsage
}

interface CodexHeadlessUsage {
    cached_input_tokens?: number
    cached_tokens?: number
    cache_read_input_tokens?: number
    completion_tokens?: number
    input_tokens?: number
    output_tokens?: number
    prompt_tokens?: number
    reasoning_output_tokens?: number
    total_tokens?: number
}

interface CodexLogLine extends CodexUsageContainer {
    data?: CodexUsageContainer
    payload?: CodexPayload
    response?: CodexUsageContainer
    result?: CodexUsageContainer
    type?: string
}

interface CodexPayload extends CodexUsageContainer {
    cwd?: string
    git?: {
        repository_url?: string
    }
    id?: string
    info?: {
        total_token_usage?: RawUsage | null
    } | null
    type?: string
}

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
    parseFile(filePath, _resolvePricing, file) {
        const lines = parseJsonlFile<CodexLogLine>(filePath)
        const sessionMeta = lines.find(line => typeof line.type === 'string' && line.type.trim() === 'session_meta')?.payload
        const sessionId = typeof sessionMeta?.id === 'string' && sessionMeta.id.trim()
            ? sessionMeta.id.trim()
            : basename(filePath, '.jsonl')
        const startedAt = getCodexTimestamp(sessionMeta) ?? lines.map(line => getCodexTimestamp(line)).find(Boolean) ?? getFileModifiedAtIso(filePath)
        const project = getProjectName(typeof sessionMeta?.cwd === 'string' ? sessionMeta.cwd.trim() : '')
        const repository = normalizeRepositoryUrl(typeof sessionMeta?.git?.repository_url === 'string' ? sessionMeta.git.repository_url.trim() : undefined) || `local/${project}`
        const fragment = createSessionFragment({
            project,
            repository,
            sessionId,
            startedAt,
            threadName: `Session for ${project}`,
        })
        const speed = file.cacheSignature === `${CODEX_SPEED_CACHE_PREFIX}fast` ? 'fast' : 'standard'
        let currentModel: string | undefined
        let currentModelIsFallback = false
        let latestInteractiveSnapshot: {
            index: number
            isFallbackModel: boolean
            model: string
            timestamp: string
            usage: NonNullable<ReturnType<typeof getCodexInteractionUsage>>
        } | null = null

        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index]!
            const payload = line.payload
            const lineType = line?.type?.trim() ?? ''
            const payloadType = payload?.type?.trim() ?? ''

            if (lineType === 'turn_context') {
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

            const effectiveType = payloadType || lineType || 'event'
            const isInteractiveTokenCount = lineType === 'event_msg' && payloadType === 'token_count'
            const rawUsage = isInteractiveTokenCount
                ? normalizeRawUsage(payload?.info?.total_token_usage)
                : getHeadlessCodexRawUsage(line)

            if (!timestamp) {
                continue
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

            if (!rawUsage) {
                continue
            }

            const usage = getCodexInteractionUsage(rawUsage)

            if (!usage) {
                continue
            }

            const resolvedModel = model ?? CODEX_FALLBACK_MODEL

            if (!model) {
                isFallbackModel = true
                currentModel = resolvedModel
                currentModelIsFallback = true
            }

            if (isInteractiveTokenCount) {
                latestInteractiveSnapshot = {
                    index,
                    isFallbackModel,
                    model: resolvedModel,
                    timestamp,
                    usage,
                }
                continue
            }

            addFragmentInteraction(fragment, {
                costUSD: usage.costUSD,
                dedupeKey: getCodexDedupeKey(sessionId, timestamp, resolvedModel, usage),
                index,
                model: resolvedModel,
                modelLookupCandidates: [resolvedModel],
                rawCostUSD: null,
                role: getCodexRole(line, true),
                speed,
                timestamp,
                type: effectiveType,
                usage: { ...usage, isFallbackModel },
            })
        }

        if (latestInteractiveSnapshot) {
            addFragmentInteraction(fragment, {
                costUSD: latestInteractiveSnapshot.usage.costUSD,
                dedupeKey: `codex:${sessionId}:token-count-snapshot`,
                index: latestInteractiveSnapshot.index,
                model: latestInteractiveSnapshot.model,
                modelLookupCandidates: [latestInteractiveSnapshot.model],
                rawCostUSD: null,
                role: 'usage',
                speed,
                timestamp: latestInteractiveSnapshot.timestamp,
                type: 'token_count_snapshot',
                usage: {
                    ...latestInteractiveSnapshot.usage,
                    isFallbackModel: latestInteractiveSnapshot.isFallbackModel,
                },
            })
        }

        return fragment.interactions.length > 0 ? [fragment] : []
    },
    watchPatterns(config) {
        return [
            join(config.codexPath, 'config.toml'),
            join(config.codexPath, 'sessions', '**', '*.jsonl'),
        ]
    },
} satisfies UsagePlatformAdapter

function getCodexInteractionUsage(
    rawUsage: RawUsage,
) {
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
    return `${CODEX_SPEED_CACHE_PREFIX}${readCodexConfigSpeed(join(codexPath, 'config.toml'))}`
}

function readCodexConfigSpeed(configPath: string): 'fast' | 'standard' {
    try {
        return parseCodexConfigSpeed(readFileSync(configPath, 'utf8')) ?? 'standard'
    }
    catch {
        return 'standard'
    }
}

const CODEX_CONFIG_ASSIGNMENT_REGEX = /^\s*([a-z_][\w-]*)\s*=\s*["']([^"']+)["']\s*(?:#.*)?$/i
const CODEX_CONFIG_SECTION_REGEX = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/

function parseCodexConfigSpeed(content: string): 'fast' | 'standard' | undefined {
    const cs = (v: string) => {
        const n = v.trim().toLowerCase()
        return n === 'priority' || n === 'fast' ? 'fast' as const : 'standard' as const
    }
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
                topLevelSpeed = cs(value)
            }

            continue
        }

        const profileName = getCodexProfileName(currentSection)

        if (profileName && key === 'service_tier') {
            profileSpeeds.set(profileName, cs(value))
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

function getCodexRole(line: CodexLogLine, hasUsage: boolean) {
    const type = typeof line.payload?.type === 'string'
        ? line.payload.type.trim()
        : typeof line.type === 'string'
            ? line.type.trim()
            : ''

    if (type === 'token_count' || hasUsage) {
        return 'usage'
    }

    return normalizeRole(type)
}

function getHeadlessCodexRawUsage(line: CodexLogLine) {
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

function getHeadlessUsageRecord(line: CodexLogLine) {
    const candidates = [
        line.usage,
        line.data?.usage,
        line.result?.usage,
        line.response?.usage,
    ]

    return candidates.find(Boolean) ?? null
}

function readHeadlessCodexUsage(usage: CodexHeadlessUsage): RawUsage | null {
    const hasStandardUsageField = usage.input_tokens != null
        || usage.cached_input_tokens != null
        || usage.cache_read_input_tokens != null
        || usage.output_tokens != null
        || usage.reasoning_output_tokens != null
        || usage.total_tokens != null

    if (hasStandardUsageField) {
        const normalized = normalizeRawUsage(usage)

        if (normalized) {
            return normalized
        }
    }

    const nfn = (v: number | undefined) => typeof v === 'number' && Number.isFinite(v) ? v : null
    const inputTokens = Math.max(
        0,
        Math.trunc(nfn(usage.input_tokens) ?? nfn(usage.prompt_tokens) ?? 0),
    )
    const cachedInputTokens = Math.max(
        0,
        Math.trunc(nfn(usage.cached_input_tokens) ?? nfn(usage.cached_tokens) ?? 0),
    )
    const outputTokens = Math.max(
        0,
        Math.trunc(nfn(usage.output_tokens) ?? nfn(usage.completion_tokens) ?? 0),
    )
    const reasoningOutputTokens = Math.max(0, Math.trunc(nfn(usage.reasoning_output_tokens) ?? 0))
    const totalTokens = Math.max(0, Math.trunc(nfn(usage.total_tokens) ?? 0))

    return {
        cached_input_tokens: cachedInputTokens,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        reasoning_output_tokens: reasoningOutputTokens,
        total_tokens: totalTokens > 0 ? totalTokens : inputTokens + outputTokens + reasoningOutputTokens,
    }
}

function extractCodexModel(line: CodexLogLine) {
    const payload = line.payload
    const candidates = [
        payload,
        line,
        line.data,
        line.result,
        line.response,
    ]

    for (const candidate of candidates) {
        const model = extractModelName(candidate)

        if (model) {
            return model
        }
    }

    return undefined
}

function getCodexTimestamp(line: CodexLogLine | CodexPayload | null | undefined) {
    if (!line) {
        return null
    }

    const data = 'data' in line ? line.data : undefined
    const result = 'result' in line ? line.result : undefined
    const response = 'response' in line ? line.response : undefined
    const payload = 'payload' in line ? line.payload : undefined

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
