<template>
    <slot />
</template>

<script lang="ts" setup>
defineOptions({
    name: 'PayloadProvider',
})

const route = useRoute()
const requiresPayload = computed(() => route.path !== '/project')

const {
    data: payload,
    error,
    execute,
    refresh,
    status,
} = useLazyFetch<TokensConsumptionResult | null>('/api/payload.json', {
    default: () => null,
    immediate: requiresPayload.value,
    key: 'payload',
})

watch(requiresPayload, (shouldFetchPayload) => {
    if (!shouldFetchPayload || payload.value !== null || status.value === 'pending') {
        return
    }

    void execute()
})

providePayloadContext({
    error: readonly(error),
    payload: readonly(payload),
    requiresPayload: readonly(requiresPayload),
    refresh,
    status: readonly(status),
})
</script>
