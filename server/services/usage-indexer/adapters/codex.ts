import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import type { ModelPricingResolver, RawUsage, SessionLogLine } from '#shared/types/platform'
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
    CODEX_FALLBACK_MODEL,
    CODEX_MODEL_ALIASES,
} from '#shared/platform/constant'
import { calculateUsageCostUSD, createLiteLLMPricingResolver } from '#shared/platform/pricing'
import { normalizeStringValue } from '#shared/utils/normalize'
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

const CODEX_DEFAULT_FAST_MULTIPLIER = 2
const CODEX_SPEED_CACHE_PREFIX = 'codex-speed:'

export const codexUsageAdapter = {
    async createPricingResolver() {
        return createLiteLLMPricingResolver({
            aliases: CODEX_MODEL_ALIASES,
            fallbackModel: CODEX_FALLBACK_MODEL,
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
        const lines = parseJsonlFile<SessionLogLine>(filePath)
        const sessionMeta = lines.find(line => line.type === 'session_meta')?.payload
        const sessionId = getSessionId(filePath, normalizeStringValue(sessionMeta?.id))
        const startedAt = toIsoString(sessionMeta?.timestamp) ?? toIsoString(lines[0]?.timestamp)
        const project = getProjectName(normalizeStringValue(sessionMeta?.cwd) ?? '')
        const repository = normalizeRepositoryUrl(sessionMeta?.git?.repository_url) || `local/${project}`
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
                ? getCodexInteractionUsage(rawUsage, model ?? CODEX_FALLBACK_MODEL, resolvePricing, speed)
                : null

            addFragmentInteraction(fragment, {
                content: extractCodexContent(line),
                costUSD: usage?.costUSD ?? 0,
                index,
                model: model ?? null,
                role: getCodexRole(line),
                timestamp,
                type: line.payload?.type ?? line.type ?? 'event',
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
    speed: 'fast' | 'standard',
) {
    const usage = convertCodexRawUsage(rawUsage)

    if (isZeroUsage(usage)) {
        return null
    }

    return {
        ...usage,
        costUSD: calculateUsageCostUSD(usage, resolvePricing(model), {
            defaultFastMultiplier: CODEX_DEFAULT_FAST_MULTIPLIER,
            speed,
        }),
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

function extractCodexContent(line: SessionLogLine) {
    const payload = line.payload

    if (!payload) {
        return ''
    }

    const message = payload.message

    if (typeof message === 'string') {
        return message
    }

    return normalizeStringValue(payload.text) || normalizeStringValue(payload.output) || normalizeStringValue(payload.content) || ''
}

function getCodexRole(line: SessionLogLine) {
    const type = line.payload?.type ?? line.type ?? ''

    if (type === 'token_count') {
        return 'usage'
    }

    return normalizeRole(type)
}

function getSessionId(filePath: string, sessionMetaId: string | undefined) {
    return sessionMetaId?.trim() || basename(filePath, '.jsonl')
}
