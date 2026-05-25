<template>
    <Body class="antialiased flex h-full text-base text-foreground bg-background overflow-hidden">
        <slot />
    </Body>
</template>

<script lang="ts" setup>
defineOptions({
    name: 'SiteBody',
})
</script>
