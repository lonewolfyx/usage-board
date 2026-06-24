export interface HermesSessionRow {
    actual_cost_usd?: number
    billing_provider?: string
    cache_read_tokens: number
    cache_write_tokens: number
    estimated_cost_usd?: number
    id: string
    input_tokens: number
    model: string
    output_tokens: number
    reasoning_tokens: number
    started_at: number
}
