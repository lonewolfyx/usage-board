export interface KiloMessageValueRaw {
    cost?: number
    id?: string
    modelID?: string
    providerID?: string
    role?: 'assistant' | 'user' | (string & {})
    session_id?: string
    time?: { created?: number }
    tokens?: {
        cache?: { read?: number, write?: number }
        input?: number
        output?: number
        reasoning?: number
        total?: number
    }
}
