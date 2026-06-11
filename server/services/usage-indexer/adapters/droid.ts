import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
import { parseJsonFile, toIsoString } from '#shared/utils/platform'
import { glob } from 'glob'
import {
    addFragmentInteraction,
    createSessionFragment,
    toDiscoveredUsageFile,
} from '../session-fragment'
import {
    applyTotalUsageFallback,
    calculateUsageCostFromCandidates,
    getFileModifiedAtIso,
    isZeroInteractionUsage,
    toInteractionUsage,
} from './shared'

export const droidUsageAdapter = {
    async createPricingResolver() {
        return createLiteLLMPricingResolver()
    },
    async discoverFiles(config) {
        const groups = await Promise.all(config.droidPaths.map(path => glob(join(path, '**', '*.settings.json'), {
            absolute: true,
        }).catch(() => [])))

        return selectLatestDroidSettingsFiles(groups.flat())
            .flatMap(filePath => toDiscoveredUsageFile(filePath, 'droid'))
    },
    parseFile(filePath, resolvePricing) {
        const data = parseJsonFile<Record<string, any>>(filePath)
        const settings = data
        const tokenUsage = settings?.tokenUsage

        if (!settings || !tokenUsage) {
            return []
        }

        const extraTotalTokens = typeof tokenUsage.thinkingTokens === 'number' && Number.isFinite(tokenUsage.thinkingTokens)
            ? tokenUsage.thinkingTokens
            : 0
        const usage = toInteractionUsage({
            ...applyTotalUsageFallback({
                cacheCreationTokens: tokenUsage.cacheCreationTokens as number | undefined,
                cacheReadTokens: tokenUsage.cacheReadTokens as number | undefined,
                inputTokens: tokenUsage.inputTokens as number | undefined,
                outputTokens: tokenUsage.outputTokens as number | undefined,
                totalTokens: Math.max((typeof tokenUsage.totalTokens === 'number' && Number.isFinite(tokenUsage.totalTokens) ? tokenUsage.totalTokens : 0) - extraTotalTokens, 0),
            }),
            extraTotalTokens,
        })

        if (isZeroInteractionUsage(usage)) {
            return []
        }

        const provider = normalizeDroidProvider(settings.providerLock.trim() ?? null)
        const model = getDroidModel(settings, filePath, provider)
        const normalizedProvider = provider === 'unknown' ? inferDroidProviderFromModel(model) : provider
        const timestamp = toIsoString(settings.providerLockTimestamp) ?? getFileModifiedAtIso(filePath)
        const sessionId = basename(filePath, '.settings.json')
        const costUSD = calculateUsageCostFromCandidates(usage, getDroidModelCandidates(model, normalizedProvider), resolvePricing)
        const fragment = createSessionFragment({
            project: 'droid',
            repository: 'local/droid',
            sessionId,
            startedAt: timestamp,
            threadName: `Droid ${sessionId}`,
        })

        addFragmentInteraction(fragment, {
            costUSD,
            dedupeKey: `droid:${sessionId}`,
            index: 0,
            model,
            modelLookupCandidates: getDroidModelCandidates(model, normalizedProvider),
            provider: normalizedProvider,
            rawCostUSD: null,
            role: 'usage',
            timestamp,
            type: 'settings',
            usage: toInteractionUsage({
                ...usage,
                costUSD,
            }),
        })

        return [fragment]
    },
    watchPatterns(config) {
        return config.droidPaths.map(path => join(path, '**', '*.settings.json'))
    },
} satisfies UsagePlatformAdapter

function getDroidModel(settings: Record<string, any>, settingsPath: string, provider: string) {
    const explicitModel = settings.model.trim()

    if (explicitModel) {
        return normalizeDroidModelName(explicitModel)
    }

    return extractDroidModelFromSidecar(settingsPath) || defaultDroidModelFromProvider(provider)
}

function normalizeDroidModelName(model: string) {
    const raw = model.startsWith('custom:') ? model.slice('custom:'.length) : model
    let bracketDepth = 0
    let withoutBrackets = ''

    for (const char of raw) {
        if (char === '[') {
            bracketDepth += 1
            continue
        }

        if (char === ']') {
            bracketDepth = Math.max(0, bracketDepth - 1)
            continue
        }

        if (bracketDepth === 0) {
            withoutBrackets += char
        }
    }

    return withoutBrackets
        .trim()
        .replace(/\.+/gu, '-')
        .replace(/\s+/gu, '-')
        .replace(/-+/gu, '-')
        .replace(/-$/u, '')
        .toLowerCase()
}

function normalizeDroidProvider(provider: string | null) {
    const normalized = provider?.trim().toLowerCase().replaceAll('-', '_') || 'unknown'

    switch (normalized) {
        case 'claude':
        case 'anthropic':
            return 'anthropic'
        case 'google':
        case 'google_ai':
        case 'gemini':
        case 'vertex':
        case 'vertex_ai':
            return 'google'
        case 'grok':
        case 'x_ai':
        case 'xai':
            return 'xai'
        case '':
            return 'unknown'
        default:
            return normalized
    }
}

function inferDroidProviderFromModel(model: string) {
    if (/(claude|opus|sonnet|haiku)/u.test(model)) {
        return 'anthropic'
    }

    if (model.startsWith('gpt-') || model.includes('-gpt-') || model.includes('chatgpt') || /^o\d/u.test(model)) {
        return 'openai'
    }

    if (model.includes('gemini')) {
        return 'google'
    }

    if (model.includes('grok')) {
        return 'xai'
    }

    return 'unknown'
}

function defaultDroidModelFromProvider(provider: string) {
    switch (provider) {
        case 'anthropic':
            return 'claude-unknown'
        case 'google':
            return 'gemini-unknown'
        case 'openai':
            return 'gpt-unknown'
        case 'xai':
            return 'grok-unknown'
        default:
            return 'unknown'
    }
}

function getDroidModelCandidates(model: string, provider: string) {
    const candidates = [model]
    const prefixes = provider === 'anthropic'
        ? ['anthropic/', 'openrouter/anthropic/']
        : provider === 'openai'
            ? ['openai/', 'openrouter/openai/']
            : provider === 'google'
                ? ['google/', 'vertex_ai/', 'openrouter/google/']
                : provider === 'xai'
                    ? ['xai/', 'openrouter/x-ai/']
                    : provider === 'unknown'
                        ? []
                        : [`${provider}/`, `openrouter/${provider}/`]

    for (const prefix of prefixes) {
        candidates.push(`${prefix}${model}`)
    }

    return candidates
}

function extractDroidModelFromSidecar(settingsPath: string) {
    const sidecarPath = settingsPath.replace(/\.settings\.json$/u, '.jsonl')

    try {
        const lines = readFileSync(sidecarPath, 'utf8').split('\n').slice(0, 500)

        for (const line of lines) {
            const markerIndex = line.indexOf('Model:')

            if (markerIndex < 0) {
                continue
            }

            const raw = line.slice(markerIndex + 'Model:'.length).split(/["\\[]/u)[0]?.trim()

            if (raw) {
                const normalized = normalizeDroidModelName(raw)

                if (normalized) {
                    return normalized
                }
            }
        }
    }
    catch {
    }

    return null
}

function selectLatestDroidSettingsFiles(filePaths: string[]) {
    const latestBySession = new Map<string, { filePath: string, timestamp: number }>()

    for (const filePath of filePaths) {
        const sessionId = basename(filePath, '.settings.json')
        const timestamp = getDroidSnapshotTimestamp(filePath)
        const current = latestBySession.get(sessionId)

        if (!current || timestamp > current.timestamp) {
            latestBySession.set(sessionId, { filePath, timestamp })
        }
    }

    return Array.from(latestBySession.values())
        .map(item => item.filePath)
        .sort((a, b) => a.localeCompare(b))
}

function getDroidSnapshotTimestamp(filePath: string) {
    const settings = parseJsonFile<Record<string, any>>(filePath)
    const timestamp = toIsoString(settings?.providerLockTimestamp)

    return timestamp ? Date.parse(timestamp) : Date.parse(getFileModifiedAtIso(filePath) ?? '') || 0
}
