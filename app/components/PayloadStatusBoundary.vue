<template>
    <main
        v-if="shouldShowLoading"
        class="flex min-h-dvh w-full flex-col items-center justify-center gap-5 px-6 text-center"
        aria-live="polite"
    >
        <div class="flex size-12 items-center justify-center rounded-md border bg-background shadow-xs">
            <Spinner class="size-6 text-muted-foreground" />
        </div>

        <div class="space-y-2">
            <p class="text-lg font-medium">
                {{ loadingText }}
            </p>
            <p class="max-w-sm text-sm text-muted-foreground">
                正在读取本地使用记录，请稍候。
            </p>
        </div>
    </main>

    <main
        v-else-if="shouldShowError"
        class="flex min-h-dvh w-full flex-col items-center justify-center gap-5 px-6 text-center"
        aria-live="assertive"
    >
        <div class="flex size-12 items-center justify-center rounded-md border border-destructive/30 bg-destructive/10 text-destructive">
            !
        </div>

        <div class="space-y-2">
            <p class="text-lg font-medium">
                数据加载失败
            </p>
            <p class="max-w-sm text-sm text-muted-foreground">
                {{ errorText }}
            </p>
        </div>

        <Button type="button" variant="outline" @click="refresh()">
            重新加载
        </Button>
    </main>

    <slot v-else />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '~/components/ui/button'
import { Spinner } from '~/components/ui/spinner'
import { usePayloadContext } from '~/composables/usePayloadContext'

defineOptions({
    name: 'PayloadStatusBoundary',
})

const {
    error,
    payload,
    refresh,
    status,
} = usePayloadContext()

const hasPayload = computed(() => payload.value !== null)
const shouldShowError = computed(() => status.value === 'error' && !hasPayload.value)
const shouldShowLoading = computed(() => !hasPayload.value && !shouldShowError.value)

const loadingText = computed(() => {
    if (status.value === 'idle') {
        return '准备加载数据'
    }

    return '数据正在加载中'
})

const errorText = computed(() => {
    const value = error.value

    if (value instanceof Error) {
        return value.message
    }

    if (typeof value === 'string' && value.length > 0) {
        return value
    }

    return '请检查本地数据源后重试。'
})
</script>
