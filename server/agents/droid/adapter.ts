import type { AgentAdapter, UsageInteractionFact, UsageSourceFile } from '#server/agents/shared/fact'
import type { IConfig } from '#shared/types/config'
import type { DroidSettingsRaw } from './types'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { discoverSourceFiles, readJsonFile } from '#server/agents/shared/io'
import { applyTotalUsageFallback, createInteractionUsage, usageHasTokens } from '#server/agents/shared/usage'
import { toIsoString } from '#shared/utils/platform'

export class DroidAdapter implements AgentAdapter {
    readonly platform = 'droid' as const
    private readonly patterns: string[]

    constructor(config: IConfig) {
        this.patterns = config.droidPaths.map(path => `${path.replace(/\/$/u, '')}/**/*.settings.json`)
    }

    async discoverSources() {
        const sources = await discoverSourceFiles(this.platform, this.patterns)
        return selectLatestDroidSettingsSources(sources)
    }

    async loadSource(source: UsageSourceFile) {
        return { facts: loadDroidFacts(source), source }
    }

    watchSourcePatterns() {
        return this.patterns
    }
}

function loadDroidFacts(source: UsageSourceFile): UsageInteractionFact[] {
    const settings = readJsonFile<DroidSettingsRaw>(source.path)
    const tokenUsage = settings?.tokenUsage

    if (!settings || !tokenUsage) {
        return []
    }

    const thinkingTokens = typeof tokenUsage.thinkingTokens === 'number' && Number.isFinite(tokenUsage.thinkingTokens)
        ? tokenUsage.thinkingTokens
        : 0
    const totalTokens = typeof tokenUsage.totalTokens === 'number' && Number.isFinite(tokenUsage.totalTokens)
        ? tokenUsage.totalTokens
        : 0
    const usage = createInteractionUsage({
        ...applyTotalUsageFallback({
            cacheCreationTokens: tokenUsage.cacheCreationTokens,
            cacheReadTokens: tokenUsage.cacheReadTokens,
            inputTokens: tokenUsage.inputTokens,
            outputTokens: tokenUsage.outputTokens,
            totalTokens: Math.max(totalTokens - thinkingTokens, 0),
        }),
        extraTotalTokens: thinkingTokens,
    })

    if (!usageHasTokens(usage)) {
        return []
    }

    const provider = normalizeDroidProvider(settings.providerLock?.trim() ?? null)
    const model = getDroidModel(settings, source.path, provider)
    const normalizedProvider = provider === 'unknown' ? inferDroidProviderFromModel(model) : provider
    const timestamp = toIsoString(settings.providerLockTimestamp) ?? toIsoString(source.mtimeMs)

    if (!timestamp) {
        return []
    }

    const sessionId = basename(source.path, '.settings.json')

    return [{
        dedupeKey: `droid:${sessionId}`,
        fallbackDedupeKey: null,
        interactionIndex: 0,
        isSidechain: false,
        model,
        modelLookupCandidates: getDroidModelCandidates(model, normalizedProvider),
        platform: 'droid',
        project: 'droid',
        provider: normalizedProvider,
        rawCostUSD: null,
        repository: 'local/droid',
        role: 'usage',
        sessionId,
        sourceFile: source.path,
        sourceFileMtime: source.mtimeMs,
        speed: 'standard',
        threadName: `Droid ${sessionId}`,
        timestamp,
        type: 'settings',
        usage,
    }]
}

function selectLatestDroidSettingsSources(sources: UsageSourceFile[]): UsageSourceFile[] {
    const latestBySession = new Map<string, { source: UsageSourceFile, timestamp: number }>()

    for (const source of sources) {
        const sessionId = basename(source.path, '.settings.json')
        const timestamp = getDroidSnapshotTimestamp(source)
        const current = latestBySession.get(sessionId)

        if (!current || timestamp > current.timestamp) {
            latestBySession.set(sessionId, { source, timestamp })
        }
    }

    return Array.from(latestBySession.values())
        .map(item => item.source)
        .sort((a, b) => a.path.localeCompare(b.path))
}

function getDroidSnapshotTimestamp(source: UsageSourceFile): number {
    const settings = readJsonFile<DroidSettingsRaw>(source.path)
    const timestamp = toIsoString(settings?.providerLockTimestamp)

    return timestamp ? Date.parse(timestamp) : source.mtimeMs
}

function getDroidModel(settings: DroidSettingsRaw, settingsPath: string, provider: string): string {
    const explicitModel = settings.model?.trim()

    if (explicitModel) {
        return normalizeDroidModelName(explicitModel)
    }

    return extractDroidModelFromSidecar(settingsPath) || defaultDroidModelFromProvider(provider)
}

function normalizeDroidModelName(model: string): string {
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

function normalizeDroidProvider(provider: string | null): string {
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

function inferDroidProviderFromModel(model: string): string {
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

function defaultDroidModelFromProvider(provider: string): string {
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

function getDroidModelCandidates(model: string, provider: string): string[] {
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

function extractDroidModelFromSidecar(settingsPath: string): string | null {
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
