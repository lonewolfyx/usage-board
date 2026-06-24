import type { RawUsage, TokenUsageSnapshot } from '#shared/types/platform'

export type CodexTimestamp = number | string

/**
 * Raw usage snapshot from either standard Codex `token_count` events or headless Codex usage records.
 * Covers all field aliases seen across Codex session formats.
 */
export interface CodexRawUsage extends TokenUsageSnapshot {
    cached_tokens?: number
    completion_tokens?: number
    input?: number
    output?: number
    prompt_tokens?: number
    reasoning_tokens?: number
}

export interface CodexInfoRaw {
    last_token_usage?: CodexRawUsage
    metadata?: { model?: string }
    model?: string
    model_name?: string
    total_token_usage?: CodexRawUsage
}

export interface CodexPayloadRaw {
    cwd?: string
    git?: { repository_url?: string }
    id?: string
    info?: CodexInfoRaw
    metadata?: { model?: string }
    model?: string
    model_name?: string
    timestamp?: CodexTimestamp
    type?: 'token_count' | (string & {})
}

export interface CodexNestedRaw {
    created_at?: CodexTimestamp
    createdAt?: CodexTimestamp
    timestamp?: CodexTimestamp
    usage?: CodexRawUsage
    model?: string
    model_name?: string
    info?: CodexInfoRaw
    metadata?: { model?: string }
}

export interface CodexSessionLineRaw {
    created_at?: CodexTimestamp
    createdAt?: CodexTimestamp
    data?: CodexNestedRaw
    payload?: CodexPayloadRaw
    response?: CodexNestedRaw
    result?: CodexNestedRaw
    timestamp?: CodexTimestamp
    type: 'event_msg' | 'session_meta' | 'turn_context' | (string & {})
    usage?: CodexRawUsage
}

export type CodexRawUsageNormalized = RawUsage
