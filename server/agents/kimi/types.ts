export interface KimiConfigRaw {
    model?: string
}

export interface KimiWireLineRaw {
    message?: {
        payload?: {
            message_id?: string
            token_usage?: {
                input_cache_creation?: number
                input_cache_read?: number
                input_other?: number
                output?: number
                total?: number
            }
        }
        type: 'StatusUpdate' | (string & {})
    }
    timestamp?: string
}
