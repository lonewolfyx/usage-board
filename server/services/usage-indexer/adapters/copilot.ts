import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
import { parse } from '#shared/utils/parse'
import { toIsoString } from '#shared/utils/platform'
import { glob } from 'glob'
import {
    addFragmentInteraction,
    createSessionFragment,
    toDiscoveredUsageFile,
} from '../session-fragment'
import {
    applyTotalUsageAsExtra,
    getFileModifiedAtIso,
    isZeroInteractionUsage,
    toInteractionUsage,
} from './shared'

const COPILOT_MODEL_ATTRS = ['gen_ai.response.model', 'gen_ai.request.model'] as const satisfies ReadonlyArray<keyof CopilotAttributes>
const COPILOT_SESSION_ATTRS = [
    ['gen_ai.conversation.id', 3],
    ['copilot_chat.session_id', 3],
    ['copilot_chat.chat_session_id', 3],
    ['session.id', 3],
    ['github.copilot.interaction_id', 2],
    ['gen_ai.response.id', 1],
] as const satisfies ReadonlyArray<readonly [keyof CopilotAttributes, number]>

type CopilotSource = 'agentSummarySpan' | 'agentTurnLog' | 'chatSpan' | 'inferenceLog'

interface CopilotCandidate {
    dedupeKey: string
    inputTokens: number
    model: string
    outputTokens: number
    responseId: string | undefined
    sessionId: string
    source: CopilotSource
    timestamp: string
    traceId: string | undefined
    usage: ReturnType<typeof toInteractionUsage>
}

interface CopilotAttributes {
    'copilot_chat.agent.turn'?: string
    'copilot_chat.chat_session_id'?: string
    'copilot_chat.session_id'?: string
    'copilot_chat.turn.index'?: number | string
    'event.name'?: string
    'gen_ai.conversation.id'?: string
    'gen_ai.operation.name'?: string
    'gen_ai.request.model'?: string
    'gen_ai.response.id'?: string
    'gen_ai.response.model'?: string
    'gen_ai.usage.cache_creation.input_tokens'?: number | string
    'gen_ai.usage.cache_read.input_tokens'?: number | string
    'gen_ai.usage.cache_write.input_tokens'?: number | string
    'gen_ai.usage.input_tokens'?: number | string
    'gen_ai.usage.output_tokens'?: number | string
    'gen_ai.usage.reasoning.output_tokens'?: number | string
    'gen_ai.usage.reasoning_tokens'?: number | string
    'gen_ai.usage.total.token_count'?: number | string
    'gen_ai.usage.total_tokens'?: number | string
    'github.copilot.interaction_id'?: string
    'session.id'?: string
    'turn.index'?: number | string
}

interface CopilotRecord {
    _body?: string
    _hrTime?: string | number
    attributes?: CopilotAttributes
    body?: string
    duration?: number
    endTime?: string | number
    hrTime?: string | number
    kind?: string
    name?: string
    observedTimestamp?: string | number
    spanContext?: {
        spanId?: string
        traceId?: string
    }
    spanId?: string
    startTime?: string | number
    time?: string | number
    timestamp?: string | number
    timeUnixNano?: string | number
    traceId?: string
    type?: string
}

export const copilotUsageAdapter = {
    async createPricingResolver() {
        return createLiteLLMPricingResolver()
    },
    async discoverFiles(config) {
        const files: string[] = []

        for (const path of config.copilotPaths) {
            if (path.endsWith('.jsonl')) {
                files.push(path)
                continue
            }

            const discovered = await glob(join(path, '**', '*.jsonl'), { absolute: true }).catch(() => [])
            files.push(...discovered)
        }

        return Array.from(new Set(files))
            .flatMap(filePath => toDiscoveredUsageFile(filePath, 'copilot'))
    },
    parseFile(filePath) {
        const lines = readFileSync(filePath, 'utf8')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.includes('"attributes"'))
        const records = lines
            .map(line => parse(line) as CopilotRecord | null)
            .filter((record): record is CopilotRecord => record !== null)
        const traceContexts = collectCopilotTraceContexts(records)
        const fallbackTimestamp = getFileModifiedAtIso(filePath)
        const candidates = records
            .map((record, index) => getCopilotCandidate(record, index, fallbackTimestamp, traceContexts))
            .filter((candidate): candidate is CopilotCandidate => Boolean(candidate))
        const selectedCandidates = filterCopilotCandidates(candidates)
        const fragments = new Map<string, ReturnType<typeof createSessionFragment>>()

        for (const candidate of selectedCandidates) {
            const fragment = fragments.get(candidate.sessionId) ?? createSessionFragment({
                project: 'copilot',
                repository: 'local/copilot',
                sessionId: candidate.sessionId,
                startedAt: candidate.timestamp,
                threadName: `Copilot ${candidate.sessionId}`,
            })

            addFragmentInteraction(fragment, {
                costUSD: 0,
                dedupeKey: candidate.dedupeKey,
                index: fragment.interactions.length,
                model: candidate.model,
                modelLookupCandidates: [candidate.model],
                rawCostUSD: null,
                role: 'usage',
                timestamp: candidate.timestamp,
                type: candidate.source,
                usage: toInteractionUsage({
                    ...candidate.usage,
                    costUSD: 0,
                }),
            })
            fragments.set(candidate.sessionId, fragment)
        }

        return Array.from(fragments.values())
    },
    watchPatterns(config) {
        return config.copilotPaths.map(path => path.endsWith('.jsonl') ? path : join(path, '**', '*.jsonl'))
    },
} satisfies UsagePlatformAdapter

function collectCopilotTraceContexts(records: CopilotRecord[]) {
    const contexts = new Map<string, { model: string | null, priority: number, sessionId: string | null }>()

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
    record: CopilotRecord,
    index: number,
    fallbackTimestamp: string | null,
    traceContexts: Map<string, { model: string | null, priority: number, sessionId: string | null }>,
): CopilotCandidate | null {
    const attributes = record.attributes

    if (!attributes) {
        return null
    }

    const source = getCopilotSource(record, attributes)

    if (!source) {
        return null
    }

    const usage = toInteractionUsage({
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

    if (isZeroInteractionUsage(usage)) {
        return null
    }

    const traceId = getCopilotTraceId(record)
    const traceContext = traceId ? traceContexts.get(traceId) : null
    const model = getFirstCopilotAttribute(attributes, COPILOT_MODEL_ATTRS) || traceContext?.model || 'unknown'
    const sessionId = getBestCopilotSessionAttribute(attributes)?.value
        || traceContext?.sessionId
        || traceId
        || 'unknown-session'
    const responseId = attributes['gen_ai.response.id']?.trim() || undefined
    const timestamp = getCopilotTimestamp(record) || fallbackTimestamp

    if (!timestamp) {
        return null
    }

    return {
        dedupeKey: getCopilotDedupeKey(source, record, attributes, traceId, sessionId, timestamp, index),
        inputTokens: usage.inputTokens,
        model,
        outputTokens: usage.outputTokens,
        responseId,
        sessionId,
        source,
        timestamp,
        traceId: traceId ?? undefined,
        usage,
    } satisfies CopilotCandidate
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

function getCopilotSource(record: CopilotRecord, attributes: CopilotAttributes): CopilotSource | null {
    const isSpan = isCopilotSpanRecord(record)
    const eventName = attributes['event.name']?.trim()
    const operation = attributes['gen_ai.operation.name']?.trim()
    const body = record.body?.trim() || record._body?.trim()
    const name = record.name?.trim()

    if (isSpan && (operation === 'chat' || name?.startsWith('chat '))) {
        return 'chatSpan'
    }

    if (isSpan && (operation === 'invoke_agent' || name?.startsWith('invoke_agent '))) {
        return 'agentSummarySpan'
    }

    if (!isSpan && (eventName === 'gen_ai.client.inference.operation.details' || body?.startsWith('GenAI inference:'))) {
        return 'inferenceLog'
    }

    if (!isSpan && (eventName === 'copilot_chat.agent.turn' || body?.startsWith('copilot_chat.agent.turn'))) {
        return 'agentTurnLog'
    }

    return null
}

function isCopilotSpanRecord(record: CopilotRecord) {
    const type = record.type?.trim()

    return type === 'span'
        || (!!record.name?.trim()
            && (
                !!record.spanId?.trim()
                || !!record.traceId?.trim()
                || record.startTime != null
                || record.endTime != null
                || record.duration != null
                || record.kind != null
            ))
}

function getCopilotDedupeKey(
    source: CopilotSource,
    record: CopilotRecord,
    attributes: CopilotAttributes,
    traceId: string | null,
    sessionId: string,
    timestamp: string,
    index: number,
) {
    const spanId = record.spanId?.trim() || record.spanContext?.spanId

    if (source === 'chatSpan' || source === 'agentSummarySpan') {
        return traceId && spanId ? `${traceId}:${spanId}` : `span:${sessionId}:${timestamp}:${index}`
    }

    if (source === 'inferenceLog') {
        return traceId && spanId ? `log:${traceId}:${spanId}` : `log:${sessionId}:${timestamp}:${index}`
    }

    const turnIndex = getCopilotAttributeNumber(attributes, 'turn.index') || getCopilotAttributeNumber(attributes, 'copilot_chat.turn.index')
    return traceId ? `agent-turn:${traceId}:${turnIndex || index}` : `agent-turn:${sessionId}:${turnIndex || index}:${index}`
}

function getCopilotTraceId(record: CopilotRecord) {
    return record.traceId?.trim() || record.spanContext?.traceId || null
}

function getCopilotAttributeNumber(attributes: CopilotAttributes, key: keyof CopilotAttributes) {
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

function getCopilotAttributeNumberFirst(attributes: CopilotAttributes, keys: ReadonlyArray<keyof CopilotAttributes>) {
    for (const key of keys) {
        const value = getCopilotAttributeNumber(attributes, key)

        if (value > 0) {
            return value
        }
    }

    return 0
}

function getFirstCopilotAttribute(attributes: CopilotAttributes, keys: ReadonlyArray<keyof CopilotAttributes>) {
    for (const key of keys) {
        const value = typeof attributes[key] === 'string' ? attributes[key].trim() : ''

        if (value) {
            return value
        }
    }

    return null
}

function getBestCopilotSessionAttribute(attributes: CopilotAttributes) {
    let best: { priority: number, value: string } | null = null

    for (const [key, priority] of COPILOT_SESSION_ATTRS) {
        const value = typeof attributes[key] === 'string' ? attributes[key].trim() : ''

        if (value && (!best || priority > best.priority)) {
            best = { priority, value }
        }
    }

    return best
}

function getCopilotTimestamp(record: CopilotRecord) {
    return toIsoString(record.endTime)
        || toIsoString(record.startTime)
        || toIsoString(record.hrTime)
        || toIsoString(record._hrTime)
        || toIsoString(record.time)
        || toIsoString(record.timestamp)
        || toIsoString(record.observedTimestamp)
        || toIsoString(record.timeUnixNano)
}
