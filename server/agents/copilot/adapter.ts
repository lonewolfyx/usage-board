import type { AgentAdapter, UsageInteractionFact, UsageSourceFile } from '#server/agents/shared/fact'
import type { IConfig } from '#shared/types/config'
import type { CopilotAttributeValue, CopilotRecordRaw, CopilotUsageSource } from './types'
import { Buffer } from 'node:buffer'
import { discoverSourceFiles, readJsonlObjects } from '#server/agents/shared/io'
import { applyTotalUsageAsExtra, createInteractionUsage, usageHasTokens } from '#server/agents/shared/usage'
import { useDateFormat } from '#shared/utils/date'
import { toIsoString } from '#shared/utils/platform'

const COPILOT_ATTRIBUTES_MARKER = Buffer.from('"attributes"')

const COPILOT_MODEL_ATTRS = ['gen_ai.response.model', 'gen_ai.request.model'] as const
const COPILOT_SESSION_ATTRS = [
    ['gen_ai.conversation.id', 3],
    ['copilot_chat.session_id', 3],
    ['copilot_chat.chat_session_id', 3],
    ['session.id', 3],
    ['github.copilot.interaction_id', 2],
    ['gen_ai.response.id', 1],
] as const

interface CopilotCandidate {
    dedupeKey: string
    model: string
    responseId: string | undefined
    sessionId: string
    source: CopilotUsageSource
    timestamp: string
    traceId: string | undefined
    usage: ReturnType<typeof createInteractionUsage>
}

interface CopilotTraceContext {
    model: string | null
    priority: number
    sessionId: string | null
}

export class CopilotAdapter implements AgentAdapter {
    readonly platform = 'copilot' as const
    private readonly patterns: string[]

    constructor(config: IConfig) {
        this.patterns = config.copilotPaths.map(path => `${path.replace(/\/$/u, '')}/**/*.jsonl`)
    }

    discoverSources() {
        return discoverSourceFiles(this.platform, this.patterns)
    }

    async loadSource(source: UsageSourceFile) {
        return { facts: loadCopilotFacts(source), source }
    }

    watchSourcePatterns() {
        return this.patterns
    }
}

function loadCopilotFacts(source: UsageSourceFile): UsageInteractionFact[] {
    const records = readJsonlObjects<CopilotRecordRaw>(source.path, COPILOT_ATTRIBUTES_MARKER)
    const fallbackTimestamp = useDateFormat(source.mtimeMs, 'iso')
    const traceContexts = collectCopilotTraceContexts(records)
    const candidates = records
        .map((record, index) => getCopilotCandidate(record, index, fallbackTimestamp, traceContexts))
        .filter((candidate): candidate is CopilotCandidate => candidate !== null)
    const selectedCandidates = filterCopilotCandidates(candidates)
    const facts: UsageInteractionFact[] = []

    for (const candidate of selectedCandidates) {
        facts.push({
            dedupeKey: candidate.dedupeKey,
            fallbackDedupeKey: null,
            interactionIndex: facts.length,
            isSidechain: false,
            model: candidate.model,
            modelLookupCandidates: [candidate.model],
            platform: 'copilot',
            project: 'copilot',
            provider: null,
            rawCostUSD: null,
            repository: 'local/copilot',
            role: 'usage',
            sessionId: candidate.sessionId,
            sourceFile: source.path,
            sourceFileMtime: source.mtimeMs,
            speed: 'standard',
            threadName: `Copilot ${candidate.sessionId}`,
            timestamp: candidate.timestamp,
            type: candidate.source,
            usage: candidate.usage,
        })
    }

    return facts
}

function collectCopilotTraceContexts(records: CopilotRecordRaw[]) {
    const contexts = new Map<string, CopilotTraceContext>()

    for (const record of records) {
        const traceId = getCopilotTraceId(record)
        const attributes = record.attributes

        if (!traceId || !attributes) {
            continue
        }

        const context = contexts.get(traceId) ?? { model: null, priority: 0, sessionId: null }
        context.model ||= getFirstCopilotAttribute(attributes, COPILOT_MODEL_ATTRS)
        const session = getBestCopilotSessionAttribute(attributes)

        if (session && session.priority > context.priority) {
            context.priority = session.priority
            context.sessionId = session.value
        }

        contexts.set(traceId, context)
    }

    return contexts
}

function getCopilotCandidate(
    record: CopilotRecordRaw,
    index: number,
    fallbackTimestamp: string | null,
    traceContexts: Map<string, CopilotTraceContext>,
): CopilotCandidate | null {
    const attributes = record.attributes

    if (!attributes) {
        return null
    }

    const source = getCopilotSource(record, attributes)

    if (!source) {
        return null
    }

    const usage = createInteractionUsage({
        ...applyTotalUsageAsExtra({
            cacheCreationTokens: getCopilotAttributeNumberFirst(attributes, ['gen_ai.usage.cache_write.input_tokens', 'gen_ai.usage.cache_creation.input_tokens']),
            cacheReadTokens: getCopilotAttributeNumber(attributes, 'gen_ai.usage.cache_read.input_tokens'),
            extraTotalTokens: getCopilotAttributeNumberFirst(attributes, ['gen_ai.usage.reasoning.output_tokens', 'gen_ai.usage.reasoning_tokens']),
            inputTokens: Math.max(
                0,
                getCopilotAttributeNumber(attributes, 'gen_ai.usage.input_tokens')
                - Math.min(
                    getCopilotAttributeNumber(attributes, 'gen_ai.usage.input_tokens'),
                    getCopilotAttributeNumber(attributes, 'gen_ai.usage.cache_read.input_tokens'),
                ),
            ),
            outputTokens: getCopilotAttributeNumber(attributes, 'gen_ai.usage.output_tokens'),
            totalTokens: getCopilotAttributeNumberFirst(attributes, ['gen_ai.usage.total_tokens', 'gen_ai.usage.total.token_count']),
        }),
    })

    if (!usageHasTokens(usage)) {
        return null
    }

    const traceId = getCopilotTraceId(record)
    const traceContext = traceId ? traceContexts.get(traceId) : null
    const model = getFirstCopilotAttribute(attributes, COPILOT_MODEL_ATTRS) || traceContext?.model || 'unknown'
    const sessionId = getBestCopilotSessionAttribute(attributes)?.value
        || traceContext?.sessionId
        || traceId
        || 'unknown-session'
    const responseId = getCopilotAttributeString(attributes, 'gen_ai.response.id') ?? undefined
    const timestamp = getCopilotTimestamp(record) || fallbackTimestamp

    if (!timestamp) {
        return null
    }

    return {
        dedupeKey: getCopilotDedupeKey(source, record, attributes, traceId, sessionId, timestamp, index),
        model,
        responseId,
        sessionId,
        source,
        timestamp,
        traceId: traceId ?? undefined,
        usage,
    }
}

function filterCopilotCandidates(candidates: CopilotCandidate[]) {
    const chatTraces = new Set(candidates.filter(candidate => candidate.source === 'chatSpan').flatMap(candidate => candidate.traceId ? [candidate.traceId] : []))
    const inferenceTraces = new Set(candidates.filter(candidate => candidate.source === 'inferenceLog').flatMap(candidate => candidate.traceId ? [candidate.traceId] : []))
    const agentTurnTraces = new Set(candidates.filter(candidate => candidate.source === 'agentTurnLog').flatMap(candidate => candidate.traceId ? [candidate.traceId] : []))
    const chatResponses = new Set(candidates.filter(candidate => candidate.source === 'chatSpan').flatMap(candidate => candidate.responseId ? [candidate.responseId] : []))
    const inferenceResponses = new Set(candidates.filter(candidate => candidate.source === 'inferenceLog').flatMap(candidate => candidate.responseId ? [candidate.responseId] : []))
    const agentTurnResponses = new Set(candidates.filter(candidate => candidate.source === 'agentTurnLog').flatMap(candidate => candidate.responseId ? [candidate.responseId] : []))

    return candidates.filter((candidate) => {
        const traceMatch = (values: Set<string>) => candidate.traceId ? values.has(candidate.traceId) : false
        const responseMatch = (values: Set<string>) => candidate.responseId ? values.has(candidate.responseId) : false

        switch (candidate.source) {
            case 'chatSpan':
                return true
            case 'inferenceLog':
                return !traceMatch(chatTraces) && !responseMatch(chatResponses)
            case 'agentTurnLog':
                return !traceMatch(chatTraces)
                    && !traceMatch(inferenceTraces)
                    && !responseMatch(chatResponses)
                    && !responseMatch(inferenceResponses)
            case 'agentSummarySpan':
                return !traceMatch(chatTraces)
                    && !traceMatch(inferenceTraces)
                    && !traceMatch(agentTurnTraces)
                    && !responseMatch(chatResponses)
                    && !responseMatch(inferenceResponses)
                    && !responseMatch(agentTurnResponses)
            default:
                return false
        }
    })
}

function getCopilotSource(record: CopilotRecordRaw, attributes: Record<string, CopilotAttributeValue>): CopilotUsageSource | null {
    const isSpan = isCopilotSpanRecord(record)
    const eventName = getCopilotAttributeString(attributes, 'event.name') ?? ''
    const operation = getCopilotAttributeString(attributes, 'gen_ai.operation.name') ?? ''
    const body = typeof record.body === 'string' ? record.body.trim() : ''
    const _body = typeof record._body === 'string' ? record._body.trim() : ''
    const bodyValue = body || _body
    const name = typeof record.name === 'string' ? record.name.trim() : ''

    if (isSpan && (operation === 'chat' || name.startsWith('chat '))) {
        return 'chatSpan'
    }

    if (isSpan && (operation === 'invoke_agent' || name.startsWith('invoke_agent '))) {
        return 'agentSummarySpan'
    }

    if (!isSpan && (eventName === 'gen_ai.client.inference.operation.details' || bodyValue.startsWith('GenAI inference:'))) {
        return 'inferenceLog'
    }

    if (!isSpan && (eventName === 'copilot_chat.agent.turn' || bodyValue.startsWith('copilot_chat.agent.turn'))) {
        return 'agentTurnLog'
    }

    return null
}

function isCopilotSpanRecord(record: CopilotRecordRaw) {
    const type = typeof record.type === 'string' ? record.type.trim() : ''
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    const spanId = typeof record.spanId === 'string' ? record.spanId.trim() : ''
    const traceId = typeof record.traceId === 'string' ? record.traceId.trim() : ''

    return type === 'span'
        || (!!name
            && (
                !!spanId
                || !!traceId
                || record.startTime != null
                || record.endTime != null
                || record.duration != null
                || record.kind != null
            ))
}

function getCopilotDedupeKey(
    source: CopilotUsageSource,
    record: CopilotRecordRaw,
    attributes: Record<string, CopilotAttributeValue>,
    traceId: string | null,
    sessionId: string,
    timestamp: string,
    index: number,
) {
    const spanId = typeof record.spanId === 'string' ? record.spanId.trim() : ''
    const spanContextSpanId = record.spanContext?.spanId
    const resolvedSpanId = spanId || (typeof spanContextSpanId === 'string' ? spanContextSpanId.trim() : '')

    if (source === 'chatSpan' || source === 'agentSummarySpan') {
        return traceId && resolvedSpanId ? `${traceId}:${resolvedSpanId}` : `span:${sessionId}:${timestamp}:${index}`
    }

    if (source === 'inferenceLog') {
        return traceId && resolvedSpanId ? `log:${traceId}:${resolvedSpanId}` : `log:${sessionId}:${timestamp}:${index}`
    }

    const turnIndex = getCopilotAttributeNumber(attributes, 'turn.index') || getCopilotAttributeNumber(attributes, 'copilot_chat.turn.index')
    return traceId ? `agent-turn:${traceId}:${turnIndex || index}` : `agent-turn:${sessionId}:${turnIndex || index}:${index}`
}

function getCopilotTraceId(record: CopilotRecordRaw): string | null {
    const traceId = typeof record.traceId === 'string' ? record.traceId.trim() : ''
    if (traceId) {
        return traceId
    }

    const spanContextTraceId = record.spanContext?.traceId
    return typeof spanContextTraceId === 'string' && spanContextTraceId.trim() ? spanContextTraceId.trim() : null
}

function getCopilotTimestamp(record: CopilotRecordRaw) {
    return toIsoString(record.endTime)
        || toIsoString(record.startTime)
        || toIsoString(record.hrTime)
        || toIsoString(record._hrTime)
        || toIsoString(record.time)
        || toIsoString(record.timestamp)
        || toIsoString(record.observedTimestamp)
        || toIsoString(record.timeUnixNano)
}

function getCopilotAttributeString(attributes: Record<string, CopilotAttributeValue>, key: string): string | null {
    const value = attributes[key]

    return typeof value === 'string' ? (value.trim() || null) : null
}

function getCopilotAttributeNumber(attributes: Record<string, CopilotAttributeValue>, key: string) {
    const value = attributes[key]

    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.trunc(value))
    }

    if (typeof value === 'string') {
        const numeric = Number.parseInt(value.trim(), 10)
        return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
    }

    return 0
}

function getCopilotAttributeNumberFirst(attributes: Record<string, CopilotAttributeValue>, keys: readonly string[]) {
    for (const key of keys) {
        const value = getCopilotAttributeNumber(attributes, key)

        if (value > 0) {
            return value
        }
    }

    return 0
}

function getFirstCopilotAttribute(attributes: Record<string, CopilotAttributeValue>, keys: readonly string[]) {
    for (const key of keys) {
        const value = attributes[key]

        if (typeof value === 'string') {
            const trimmed = value.trim()

            if (trimmed) {
                return trimmed
            }
        }
    }

    return null
}

function getBestCopilotSessionAttribute(attributes: Record<string, CopilotAttributeValue>) {
    let best: { priority: number, value: string } | null = null

    for (const [key, priority] of COPILOT_SESSION_ATTRS) {
        const value = attributes[key]

        if (typeof value !== 'string') {
            continue
        }

        const trimmed = value.trim()

        if (trimmed && (!best || priority > best.priority)) {
            best = { priority, value: trimmed }
        }
    }

    return best
}
