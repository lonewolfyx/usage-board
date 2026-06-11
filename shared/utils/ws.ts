import type { UsageUpdateMessage } from '#shared/types/ws'

export function isUsageUpdateMessage(value: unknown): value is UsageUpdateMessage {
    return value !== null
        && typeof value === 'object'
        && (value as Record<string, unknown>).type === 'usage_update'
        && typeof (value as Record<string, unknown>).payload === 'object'
        && (value as Record<string, unknown>).payload !== null
}

export function isWebSocketError(value: unknown): value is { message: string, type: 'error' } {
    return value !== null
        && typeof value === 'object'
        && (value as Record<string, unknown>).type === 'error'
        && typeof (value as Record<string, unknown>).message === 'string'
}

export function isProjectWebSocketResponse(value: unknown): value is { data: unknown, requestId: string } {
    return value !== null
        && typeof value === 'object'
        && typeof (value as Record<string, unknown>).requestId === 'string'
        && 'data' in (value as Record<string, unknown>)
}
