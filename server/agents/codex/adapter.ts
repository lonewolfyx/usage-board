import type { AgentAdapter, UsageInteractionFact, UsageSourceFile } from '#server/agents/shared/fact'
import type { IConfig } from '#shared/types/config'
import type { RawUsage } from '#shared/types/platform'
import type { CodexRawUsage, CodexSessionLineRaw } from './types'
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { discoverSourceFiles, readJsonlObjects } from '#server/agents/shared/io'
import { createModelLookupCandidates } from '#server/agents/shared/model'
import { createInteractionUsage, normalizeRole, usageHasTokens } from '#server/agents/shared/usage'
import { CODEX_FALLBACK_MODEL, CODEX_MODEL_ALIASES } from '#shared/platform/constant'
import { useDateFormat } from '#shared/utils/date'
import {
    convertCodexRawUsage,
    extractModelName,
    getProjectName,
    isZeroUsage,
    normalizeRawUsage,
    normalizeRepositoryUrl,
    subtractRawUsage,
    toIsoString,
} from '#shared/utils/platform'

const CODEX_SPEED_CACHE_PREFIX = 'codex-speed:'
const CODEX_AUTO_REVIEW_MODEL = 'codex-auto-review'
const CODEX_AUTO_REVIEW_FALLBACK_MODELS = [
    { model: 'gpt-5.5', releasedOn: '2026-04-23' },
    { model: 'gpt-5.4', releasedOn: '2026-03-05' },
    { model: 'gpt-5.3-codex', releasedOn: '2026-02-05' },
    { model: 'gpt-5.2-codex', releasedOn: '2025-12-11' },
    { model: 'gpt-5.1-codex', releasedOn: '2025-11-13' },
    { model: 'gpt-5-codex', releasedOn: '2025-09-15' },
    { model: 'gpt-5', releasedOn: '2025-08-07' },
] as const

const CODEX_CONFIG_ASSIGNMENT_REGEX = /^\s*([a-z_][\w-]*)\s*=\s*["']([^"']+)["']\s*(?:#.*)?$/iu
const CODEX_CONFIG_SECTION_REGEX = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/u

export class CodexAdapter implements AgentAdapter {
    readonly platform = 'codex' as const
    private readonly patterns: string[]
    private readonly watchPatternsList: string[]
    private readonly codexPath: string

    constructor(config: IConfig) {
        this.codexPath = config.codexPath.replace(/\/$/u, '')
        this.patterns = [
            `${this.codexPath}/sessions/**/*.jsonl`,
            `${this.codexPath}/archived_sessions/**/*.jsonl`,
        ]
        this.watchPatternsList = [
            join(this.codexPath, 'config.toml'),
            join(this.codexPath, 'sessions', '**', '*.jsonl'),
            join(this.codexPath, 'archived_sessions', '**', '*.jsonl'),
        ]
    }

    async discoverSources() {
        const sources = await discoverSourceFiles(this.platform, this.patterns)
        const speed = readCodexConfigSpeed(join(this.codexPath, 'config.toml'))
        const cacheSignature = `${CODEX_SPEED_CACHE_PREFIX}${speed}`

        return sources.map(source => ({ ...source, cacheSignature }))
    }

    async loadSource(source: UsageSourceFile) {
        return { facts: loadCodexFacts(source), source }
    }

    watchSourcePatterns() {
        return this.watchPatternsList
    }
}

function loadCodexFacts(source: UsageSourceFile): UsageInteractionFact[] {
    const lines = readJsonlObjects<CodexSessionLineRaw>(source.path)
    const sessionMeta = lines.find(line => line.type === 'session_meta')?.payload
    const sessionId = typeof sessionMeta?.id === 'string' && sessionMeta.id.trim()
        ? sessionMeta.id.trim()
        : basename(source.path, '.jsonl')
    const project = getProjectName(typeof sessionMeta?.cwd === 'string' ? sessionMeta.cwd.trim() : '')
    const repository = normalizeRepositoryUrl(typeof sessionMeta?.git?.repository_url === 'string' ? sessionMeta.git.repository_url.trim() : undefined) || `local/${project}`
    const speed = source.cacheSignature === `${CODEX_SPEED_CACHE_PREFIX}fast` ? 'fast' : 'standard'
    const fileMtimeIso = useDateFormat(source.mtimeMs, 'iso') ?? new Date(source.mtimeMs).toISOString()

    const facts: UsageInteractionFact[] = []
    let previousTotals: RawUsage | null = null
    let currentModel: string | undefined
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]!
        const payload = line.payload
        const lineType = line.type?.trim() ?? ''
        const payloadType = payload?.type?.trim() ?? ''

        if (lineType === 'turn_context') {
            const contextModel = extractModelName(payload)

            if (contextModel) {
                currentModel = contextModel
            }
        }

        const timestamp = getCodexTimestamp(line) ?? fileMtimeIso
        const extractedModel = extractCodexModel(line)

        if (extractedModel) {
            currentModel = extractedModel
        }

        const rawUsage = getCodexRawUsage(line, previousTotals)
        const totalUsage = normalizeRawUsage(payload?.info?.total_token_usage ?? null)

        if (totalUsage) {
            previousTotals = totalUsage
        }

        let model = extractedModel ?? currentModel

        if (!model && rawUsage) {
            model = CODEX_FALLBACK_MODEL
            currentModel = model
        }

        const effectiveType = payloadType || lineType || 'event'

        if (effectiveType !== 'token_count') {
            continue
        }

        if (!rawUsage) {
            continue
        }

        const delta = convertCodexRawUsage(rawUsage)

        if (isZeroUsage(delta)) {
            continue
        }

        const usage = createInteractionUsage({
            cacheReadTokens: delta.cachedInputTokens,
            inputTokens: delta.inputTokens,
            outputTokens: delta.outputTokens,
            reasoningOutputTokens: delta.reasoningOutputTokens,
            totalTokens: delta.totalTokens,
        })

        if (!usageHasTokens(usage)) {
            continue
        }

        const resolvedModel = resolveCodexLogModel(model ?? CODEX_FALLBACK_MODEL, timestamp)
        const aliasTarget = CODEX_MODEL_ALIASES[resolvedModel]

        facts.push({
            dedupeKey: getCodexDedupeKey(timestamp, resolvedModel, delta),
            fallbackDedupeKey: null,
            interactionIndex: index,
            isSidechain: false,
            model: resolvedModel,
            modelLookupCandidates: createModelLookupCandidates({
                addProviderPrefixes: ['openai'],
                aliases: aliasTarget ? [aliasTarget] : [],
                model: resolvedModel,
                removeFastSuffix: true,
                stripProviderPrefixes: ['openai'],
            }),
            platform: 'codex',
            project,
            provider: 'openai',
            rawCostUSD: null,
            repository,
            role: getCodexRole(line),
            sessionId,
            sourceFile: source.path,
            sourceFileMtime: source.mtimeMs,
            speed,
            threadName: `Session for ${project}`,
            timestamp,
            type: effectiveType,
            usage,
        })
    }

    return facts
}

function resolveCodexLogModel(model: string, timestamp: string) {
    if (model !== CODEX_AUTO_REVIEW_MODEL) {
        return model
    }

    const date = /^\d{4}-\d{2}-\d{2}/u.exec(timestamp)?.[0]

    if (!date) {
        return CODEX_FALLBACK_MODEL
    }

    return CODEX_AUTO_REVIEW_FALLBACK_MODELS.find(fallback => date >= fallback.releasedOn)?.model ?? CODEX_FALLBACK_MODEL
}

function getCodexRawUsage(line: CodexSessionLineRaw, previousTotals: RawUsage | null): RawUsage | null {
    const payload = line.payload
    const lineType = line.type?.trim() ?? ''
    const payloadType = payload?.type?.trim() ?? ''

    if (lineType === 'event_msg' && payloadType === 'token_count') {
        const info = payload?.info
        const lastUsage = normalizeRawUsage(info?.last_token_usage ?? null)
        const totalUsage = normalizeRawUsage(info?.total_token_usage ?? null)
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

function getHeadlessCodexRawUsage(line: CodexSessionLineRaw): RawUsage | null {
    const usage = getHeadlessUsageRecord(line)

    if (!usage) {
        return null
    }

    const normalizedUsage = readHeadlessCodexUsage(usage)

    if (!normalizedUsage) {
        return null
    }

    if (normalizedUsage.total_tokens > 0) {
        return normalizedUsage
    }

    return normalizedUsage.input_tokens > 0
        || normalizedUsage.cached_input_tokens > 0
        || normalizedUsage.output_tokens > 0
        || normalizedUsage.reasoning_output_tokens > 0
        ? normalizedUsage
        : null
}

function getHeadlessUsageRecord(line: CodexSessionLineRaw): CodexRawUsage | null {
    const candidates = [
        line.usage,
        line.data?.usage,
        line.result?.usage,
        line.response?.usage,
    ]

    return candidates.find((candidate): candidate is CodexRawUsage => candidate != null) ?? null
}

function readHeadlessCodexUsage(usage: CodexRawUsage): RawUsage | null {
    const hasStandardUsageField = [
        'input_tokens',
        'cached_input_tokens',
        'cache_read_input_tokens',
        'output_tokens',
        'reasoning_output_tokens',
        'total_tokens',
    ].some(key => (usage as Record<string, unknown>)[key] !== undefined && (usage as Record<string, unknown>)[key] !== null)

    if (hasStandardUsageField) {
        const normalized = normalizeRawUsage(usage)

        if (normalized) {
            return normalized
        }
    }

    const nfn = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null
    const inputTokens = Math.max(0, Math.trunc(nfn(usage.input_tokens) ?? nfn(usage.prompt_tokens) ?? 0))
    const cachedInputTokens = Math.max(0, Math.trunc(nfn(usage.cached_input_tokens) ?? nfn(usage.cached_tokens) ?? 0))
    const outputTokens = Math.max(0, Math.trunc(nfn(usage.output_tokens) ?? nfn(usage.completion_tokens) ?? 0))
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

function extractCodexModel(line: CodexSessionLineRaw): string | undefined {
    const candidates: unknown[] = [
        line.payload,
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

function getCodexTimestamp(line: CodexSessionLineRaw | null | undefined): string | null {
    if (!line) {
        return null
    }

    const data = line.data
    const result = line.result
    const response = line.response
    const payload = line.payload

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

function getCodexRole(line: CodexSessionLineRaw): string {
    const type = typeof line.payload?.type === 'string'
        ? line.payload.type.trim()
        : line.type.trim()

    if (type === 'token_count') {
        return 'usage'
    }

    return normalizeRole(type)
}

function getCodexDedupeKey(timestamp: string, model: string, delta: { cachedInputTokens: number, inputTokens: number, outputTokens: number, reasoningOutputTokens: number, totalTokens: number }) {
    const rawInputTokens = delta.inputTokens + delta.cachedInputTokens

    return [
        'codex',
        timestamp,
        model,
        String(rawInputTokens),
        String(delta.cachedInputTokens),
        String(delta.outputTokens),
        String(delta.reasoningOutputTokens),
        String(delta.totalTokens),
    ].join(':')
}

function readCodexConfigSpeed(configPath: string): 'fast' | 'standard' {
    try {
        return parseCodexConfigSpeed(readFileSync(configPath, 'utf8')) ?? 'standard'
    }
    catch {
        return 'standard'
    }
}

function parseCodexConfigSpeed(content: string): 'fast' | 'standard' | undefined {
    const classifySpeed = (v: string): 'fast' | 'standard' => {
        const n = v.trim().toLowerCase()
        return n === 'priority' || n === 'fast' ? 'fast' : 'standard'
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
                topLevelSpeed = classifySpeed(value)
            }

            continue
        }

        const profileName = getCodexProfileName(currentSection)

        if (profileName && key === 'service_tier') {
            profileSpeeds.set(profileName, classifySpeed(value))
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
