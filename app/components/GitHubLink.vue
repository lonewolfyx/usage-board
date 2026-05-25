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
            <Icon class="size-5" name="mdi:github" />
        </NuxtLink>
    </Button>
</template>

<script lang="ts" setup>
const app = useAppConfig()
</script>
