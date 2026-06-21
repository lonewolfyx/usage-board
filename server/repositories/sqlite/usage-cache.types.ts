export interface SessionRow {
    id: string
    session_id: string
    interaction_index: number
    platform: string
    project_name: string
    repository: string
    thread_name: string
    session_started_at: string | null
    // interaction-level fields
    timestamp: string | null
    role: string
    type: string
    content: string
    model: string | null
    // token fields
    input_token: number
    output_token: number
    cached_input_token: number
    cache_creation: number
    cache_read: number
    reasoning_token: number
    total_token: number
    raw_cost_usd: number | null
    speed: string | null
    provider: string | null
    is_fallback_model: number
    tool_tokens: number
    extra_total_tokens: number
    // dedup + source
    dedupe_key: string | null
    fallback_dedupe_key: string | null
    source_file: string | null
    is_sidechain: number
    create_time: string
}

export interface SourceFileRow {
    path: string
    platform: string
    hash: string
    size: number
    mtime_ms: number
    updated_at: string
}

export interface SchemaMetaRow {
    schema_version: number
    package_version: string
}
