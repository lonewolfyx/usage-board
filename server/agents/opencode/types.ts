export interface OpenCodeMessageRaw {
    cost?: number
    id?: string
    modelID?: string
    providerID?: string
    sessionID?: string
    time?: { created?: number }
    tokens?: {
        cache?: { read?: number, write?: number }
        input?: number
        output?: number
        total?: number
    }
}
