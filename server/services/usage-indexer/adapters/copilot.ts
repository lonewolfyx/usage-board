import type { UsagePlatformAdapter } from '#server/services/usage-indexer/platform-adapter'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLiteLLMPricingResolver } from '#shared/platform/pricing'
import { normalizeStringValue, normalizeUnknownRecord } from '#shared/utils/normalize'
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
    calculateUsageCostFromCandidates,
    getFileModifiedAtIso,
    isZeroInteractionUsage,
    toInteractionUsage,
} from './shared'

const COPILOT_MODEL_ATTRS = ['gen_ai.response.model', 'gen_ai.request.model'] as const
const COPILOT_SESSION_ATTRS = [
    ['gen_ai.conversation.id', 3],
    ['copilot_chat.session_id', 3],
    ['copilot_chat.chat_session_id', 3],
    ['session.id', 3],
    ['github.copilot.interaction_id', 2],
    ['gen_ai.response.id', 1],
] as const

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
    parseFile(filePath, resolvePricing) {
        const lines = readFileSync(filePath, 'utf8')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.includes('"attributes"'))
        const records = lines
            .map(line => parse(line) as Record<string, unknown> | null)
            .filter((record): record is Record<string, unknown> => record !== null)
        const traceContexts = collectCopilotTraceContexts(records)
        const fallbackTimestamp = getFileModifiedAtIso(filePath)
        const candidates = records
            .map((record, index) => getCopilotCandidate(record, index, fallbackTimestamp, traceContexts))
            .filter((candidate): candidate is CopilotCandidate => Boolean(candidate))
        const selectedCandidates = filterCopilotCandidates(candidates)
        const fragments = new Map<string, ReturnType<typeof createSessionFragment>>()

        for (const candidate of selectedCandidates) {
            const costUSD = calculateUsageCostFromCandidates(candidate.usage, [candidate.model], resolvePricing, {
                includeExtraTotalAsOutput: true,
                includeReasoningAsOutput: false,
            })
            const fragment = fragments.get(candidate.sessionId) ?? createSessionFragment({
                project: 'copilot',
                repository: 'local/copilot',
                sessionId: candidate.sessionId,
                startedAt: candidate.timestamp,
                threadName: `Copilot ${candidate.sessionId}`,
            })

            addFragmentInteraction(fragment, {
                costUSD,
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
                    costUSD,
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

function collectCopilotTraceContexts(records: Record<string, unknown>[]) {
    const contexts = new Map<string, { model: string | null, priority: number, sessionId: string | null }>()

    for (const record of records) {
        const traceId = getCopilotTraceId(record)
        const attributes = normalizeUnknownRecord(record.attributes)

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
    record: Record<string, unknown>,
    index: number,
    fallbackTimestamp: string | null,
    traceContexts: Map<string, { model: string | null, priority: number, sessionId: string | null }>,
): CopilotCandidate | null {
    const attributes = normalizeUnknownRecord(record.attributes)

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
    const responseId = getCopilotAttributeString(attributes, 'gen_ai.response.id') ?? undefined
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

function getCopilotSource(record: Record<string, unknown>, attributes: Record<string, unknown>): CopilotSource | null {
    const isSpan = isCopilotSpanRecord(record)
    const eventName = getCopilotAttributeString(attributes, 'event.name')
    const operation = getCopilotAttributeString(attributes, 'gen_ai.operation.name')
    const body = normalizeStringValue(record.body) || normalizeStringValue(record._body)
    const name = normalizeStringValue(record.name)

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

function isCopilotSpanRecord(record: Record<string, unknown>) {
    const type = normalizeStringValue(record.type)

    return type === 'span'
        || (!!normalizeStringValue(record.name)
            && (
                !!normalizeStringValue(record.spanId)
                || !!normalizeStringValue(record.traceId)
                || record.startTime != null
                || record.endTime != null
                || record.duration != null
                || record.kind != null
            ))
}

function getCopilotDedupeKey(
    source: CopilotSource,
    record: Record<string, unknown>,
    attributes: Record<string, unknown>,
    traceId: string | null,
    sessionId: string,
    timestamp: string,
    index: number,
) {
    const spanId = normalizeStringValue(record.spanId) || normalizeStringValue(normalizeUnknownRecord(record.spanContext)?.spanId)

    if (source === 'chatSpan' || source === 'agentSummarySpan') {
        return traceId && spanId ? `${traceId}:${spanId}` : `span:${sessionId}:${timestamp}:${index}`
    }

    if (source === 'inferenceLog') {
        return traceId && spanId ? `log:${traceId}:${spanId}` : `log:${sessionId}:${timestamp}:${index}`
    }

    const turnIndex = getCopilotAttributeNumber(attributes, 'turn.index') || getCopilotAttributeNumber(attributes, 'copilot_chat.turn.index')
    return traceId ? `agent-turn:${traceId}:${turnIndex || index}` : `agent-turn:${sessionId}:${turnIndex || index}:${index}`
}

function getCopilotTraceId(record: Record<string, unknown>) {
    return normalizeStringValue(record.traceId) || normalizeStringValue(normalizeUnknownRecord(record.spanContext)?.traceId) || null
}

function getCopilotAttributeString(attributes: Record<string, unknown>, key: string) {
    return normalizeStringValue(attributes[key])
}

function getCopilotAttributeNumber(attributes: Record<string, unknown>, key: string) {
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

function getCopilotAttributeNumberFirst(attributes: Record<string, unknown>, keys: readonly string[]) {
    for (const key of keys) {
        const value = getCopilotAttributeNumber(attributes, key)

        if (value > 0) {
            return value
        }
    }

    return 0
}

function getFirstCopilotAttribute(attributes: Record<string, unknown>, keys: readonly string[]) {
    for (const key of keys) {
        const value = getCopilotAttributeString(attributes, key)

        if (value) {
            return value
        }
    }

    return null
}

function getBestCopilotSessionAttribute(attributes: Record<string, unknown>) {
    let best: { priority: number, value: string } | null = null

    for (const [key, priority] of COPILOT_SESSION_ATTRS) {
        const value = getCopilotAttributeString(attributes, key)

        if (value && (!best || priority > best.priority)) {
            best = { priority, value }
        }
    }

    return best
}

function getCopilotTimestamp(record: Record<string, unknown>) {
    return toIsoString(record.endTime)
        || toIsoString(record.startTime)
        || toIsoString(record.hrTime)
        || toIsoString(record._hrTime)
        || toIsoString(record.time)
        || toIsoString(record.timestamp)
        || toIsoString(record.observedTimestamp)
        || toIsoString(record.timeUnixNano)
}
