import type { TokensConsumptionResult } from '#shared/types/usage-dashboard'
import type { DeepReadonly, Ref } from 'vue'
import { createContext } from 'reka-ui'

type PayloadRequestStatus = 'error' | 'idle' | 'pending' | 'success'
type PayloadData = DeepReadonly<TokensConsumptionResult> | null

interface PayloadContext {
    payload: Readonly<Ref<PayloadData>>
    requiresPayload: Readonly<Ref<boolean>>
    status: Readonly<Ref<PayloadRequestStatus>>
    error: Readonly<Ref<unknown>>
    refresh: () => Promise<void>
}

export const [usePayloadContext, providePayloadContext] = createContext<PayloadContext>('PayloadProvider')
