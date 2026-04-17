<template>
    <slot />
</template>

<script setup lang="ts">
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
} = useLazyFetch<TokensConsumptionResult | null>('/api/payload.json', {
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
