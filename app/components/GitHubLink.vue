<template>
    <Button
        as-child
        class="h-8 shadow-none"
        size="sm"
        variant="ghost"
    >
        <NuxtLink
            :to="app.github.link"
            rel="noreferrer"
            target="_blank"
        >
            <Icon name="mdi:github" />
            <Skeleton
                v-if="pending"
                class="h-4 w-8"
            />
            <span
                v-else
                class="text-muted-foreground w-8 text-xs tabular-nums"
            >
                {{ stars }}
            </span>
        </NuxtLink>
    </Button>
</template>

<script lang="ts" setup>
interface UnghRepoResponse {
    repo?: {
        stars?: number
    }
}

const app = useAppConfig()
const { data, pending } = useLazyFetch<UnghRepoResponse>(`https://ungh.cc/repos/${app.github.repo}`)

const stars = computed(() => {
    const count = data.value?.repo?.stars
    if (!count)
        return '∞'
    return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count.toLocaleString()
})
</script>
