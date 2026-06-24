export interface GooseSessionRow {
    accumulated_input_tokens?: number
    accumulated_output_tokens?: number
    accumulated_total_tokens?: number
    created_at: number | string
    id: string
    input_tokens?: number
    model_config_json: string
    output_tokens?: number
    provider_name?: string
    total_tokens?: number
}

export interface GooseModelConfig {
    model_name?: string
}
