import type { TokensConsumptionResult } from '#shared/types/usage-dashboard'
import type { DeepReadonly, Ref } from 'vue'
import { createContext } from 'reka-ui'

export type PayloadRequestStatus = 'error' | 'idle' | 'pending' | 'success'
export type PayloadData = DeepReadonly<TokensConsumptionResult> | null

export interface PayloadContext {
    payload: Readonly<Ref<PayloadData>>
    requiresPayload: Readonly<Ref<boolean>>
    status: Readonly<Ref<PayloadRequestStatus>>
    error: Readonly<Ref<unknown>>
    refresh: () => Promise<void>
    execute: () => Promise<void>
    clear: () => void
}

export const [usePayloadContext, providePayloadContext] = createContext<PayloadContext>('PayloadProvider')
