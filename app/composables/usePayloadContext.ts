import type { TokensConsumptionResult } from '#shared/types/usage-dashboard'
import type { DeepReadonly, Ref } from 'vue'
import { createContext } from 'reka-ui'

interface PayloadContext {
    payload: Readonly<Ref<DeepReadonly<TokensConsumptionResult> | null>>
    requiresPayload: Readonly<Ref<boolean>>
    status: Readonly<Ref<'error' | 'idle' | 'pending' | 'success'>>
    error: Readonly<Ref<unknown>>
    refresh: () => Promise<void>
}

export const [usePayloadContext, providePayloadContext] = createContext<PayloadContext>('PayloadProvider')
