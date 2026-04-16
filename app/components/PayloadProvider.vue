<template>
    <slot />
</template>

<script setup lang="ts">
import type { TokensConsumptionResult } from '#shared/types/usage-dashboard'
import { readonly } from 'vue'
import { providePayloadContext } from '~/composables/usePayloadContext'

defineOptions({
    name: 'PayloadProvider',
})

const {
    clear,
    data: payload,
    error,
    execute,
    refresh,
    status,
} = await useFetch<TokensConsumptionResult | null>('/api/payload.json', {
    default: () => null,
    key: 'payload',
})

providePayloadContext({
    clear,
    error: readonly(error),
    execute,
    payload: readonly(payload),
    refresh,
    status: readonly(status),
})
</script>
