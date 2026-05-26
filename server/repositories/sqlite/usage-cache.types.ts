import type { IndexedUsageSourceFile } from '#server/types/usage-indexer'
import type { ProjectUsagePlatform } from '#shared/types/ai'
import type {
    LoadUsageResult,
    ProjectSessionInteractionItem,
    ProjectSessionUsageItem,
    UsageOverviewCard,
} from '#shared/types/usage-dashboard'

export type SnapshotKey = 'bootstrap' | 'project_catalog'
export type UsageScopeKind = 'bootstrap' | 'project'
export type TokenRowBucket = 'daily' | 'monthly' | 'session' | 'weekly'
export type PersistedUsageScope = Omit<LoadUsageResult, 'sessionUsage'> & { sessionUsage: ProjectSessionUsageItem[] }

export interface CacheStateRow {
    key: SnapshotKey
    payload_hash: string
    updated_at: string
    version: string | null
}

export interface SchemaVersionRow {
    schema_version: number
}

export interface SqliteNameRow {
    name: string
}

export interface ProjectCatalogEntryRow {
    label: string
    platforms_json: string
    total_tokens: number
}

export interface LegacyProjectCatalogTypeRow {
    label: string
    type: string
}

export interface ProjectRow {
    create_time: string | null
    label: string
    session_count: number
}

export interface ProjectModelRow {
    model: string
    model_order: number
    project_label: string
}

export interface UsageScopeRow {
    payload_hash: string
    platform: ProjectUsagePlatform
    project_label: string | null
    scope_key: string
    scope_kind: UsageScopeKind
    today_top_model: string | null
    today_top_model_total_tokens: number | null
    today_top_project: string | null
    today_top_project_session_count: number | null
    today_total_cost: number
    today_total_tokens: number
    updated_at: string
}

export interface OverviewCardRow {
    detail: string | null
    icon: string
    name: string
    position: number
    scope_key: string
    trend: string
    trend_tone: UsageOverviewCard['trendTone']
    value: string
}

export interface TokenRowRow {
    bucket: TokenRowBucket
    cached_input_tokens: number
    cost_usd: number
    input_tokens: number
    label: string
    output_tokens: number
    period: string
    reasoning_output_tokens: number
    row_id: string
    row_order: number
    scope_key: string
    session_count: number
    total_tokens: number
}

export interface TokenRowModelRow {
    bucket: TokenRowBucket
    model: string
    model_order: number
    row_id: string
    scope_key: string
}

export interface TokenRowProjectRow {
    bucket: TokenRowBucket
    project: string
    project_order: number
    row_id: string
    scope_key: string
}

export interface DailyUsageRow {
    cached_input_tokens: number
    cost_usd: number
    date: string
    input_tokens: number
    output_tokens: number
    reasoning_output_tokens: number
    row_order: number
    scope_key: string
    total_tokens: number
}

export interface DailyUsageModelRow {
    cached_input_tokens: number
    date: string
    input_tokens: number
    is_fallback: number
    model: string
    model_order: number
    output_tokens: number
    reasoning_output_tokens: number
    scope_key: string
    total_tokens: number
}

export interface MonthlyModelUsageRow {
    model: string
    month: string
    row_order: number
    scope_key: string
    token_total: number
}

export interface ProjectUsageRow {
    cost_usd: number
    detail: string
    label: string
    percent: number
    repository: string
    row_order: number
    scope_key: string
    sessions: number
    token_total: number
    tone: string | null
    value: string
}

export interface SessionRow {
    cached_input_tokens: number
    cost_usd: number
    date: string
    duration: string
    duration_minutes: number
    input_tokens: number
    last_activity: string
    model: string
    month: string
    output_tokens: number
    project: string
    reasoning_output_tokens: number
    repository: string
    scope_key: string
    session_id: string
    session_key: string
    session_order: number
    started_at: string
    thread_name: string
    token_total: number
    top_model: string
    week: string
}

export interface SessionModelRow {
    model: string
    model_order: number
    scope_key: string
    session_key: string
}

export interface ScopeInteractionRow {
    cache_creation_tokens: number | null
    cache_read_tokens: number | null
    cached_input_tokens: number | null
    content: string
    cost_usd: number
    extra_total_tokens: number | null
    input_tokens: number | null
    interaction_index: number
    interaction_order: number
    is_fallback_model: number | null
    model: string | null
    output_tokens: number | null
    reasoning_output_tokens: number | null
    role: ProjectSessionInteractionItem['role']
    scope_key: string
    session_key: string
    timestamp: string | null
    tool_tokens: number | null
    total_tokens: number | null
    type: string
    usage_cost_usd: number | null
}

export interface IndexedFileRow {
    cache_signature: string
    mtime_ms: number
    path: string
    platform: IndexedUsageSourceFile['platform']
    size: number
    updated_at: string
}

export interface IndexedFileProjectRow {
    path: string
    project_name: string
    project_order: number
}

export interface IndexedFragmentRow {
    duration_end_at: string | null
    fragment_id: number
    fragment_key: string
    fragment_order: number
    path: string
    project: string
    repository: string
    session_id: string
    started_at: string | null
    thread_name: string
}

export interface IndexedInteractionRow {
    cache_creation_tokens: number | null
    cache_read_tokens: number | null
    cached_input_tokens: number | null
    content: string
    cost_usd: number
    dedupe_key: string | null
    extra_total_tokens: number | null
    fragment_id: number
    input_tokens: number | null
    interaction_index: number
    interaction_order: number
    is_fallback_model: number | null
    model: string | null
    output_tokens: number | null
    reasoning_output_tokens: number | null
    role: ProjectSessionInteractionItem['role']
    timestamp: string | null
    tool_tokens: number | null
    total_tokens: number | null
    type: string
    usage_cost_usd: number | null
}

export interface LegacySnapshotRow {
    payload: string
    payload_hash: string
    updated_at: string
}

export interface LegacyProjectSnapshotRow extends LegacySnapshotRow {
    label: string
}

export interface LegacyIndexedSourceFileRow {
    mtime_ms: number
    path: string
    payload: string
    platform: IndexedUsageSourceFile['platform']
    project_names: string
    size: number
    updated_at: string
}
