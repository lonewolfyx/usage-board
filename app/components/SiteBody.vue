<template>
    <Body class="antialiased flex h-full text-base text-foreground bg-background">
        <slot />
    </Body>
</template>

<script lang="ts" setup>
defineOptions({
    name: 'SiteBody',
})
</script>
