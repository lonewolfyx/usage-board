import type { UsageUpdateMessage } from '#shared/types/ws'
import { normalizeUnknownRecord } from '#shared/utils/normalize'

export function isUsageUpdateMessage(value: unknown): value is UsageUpdateMessage {
    const record = normalizeUnknownRecord(value)

    return record !== null
        && record.type === 'usage_update'
        && typeof record.payload === 'object'
        && record.payload !== null
}

export function isWebSocketError(value: unknown): value is { message: string, type: 'error' } {
    const record = normalizeUnknownRecord(value)

    return record !== null
        && record.type === 'error'
        && typeof record.message === 'string'
}

export function isProjectWebSocketResponse(value: unknown): value is { data: unknown, requestId: string } {
    const record = normalizeUnknownRecord(value)

    return record !== null
        && typeof record.requestId === 'string'
        && 'data' in record
}
