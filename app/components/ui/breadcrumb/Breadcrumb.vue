<template>
    <nav
        aria-label="breadcrumb"
        data-slot="breadcrumb"
        :class="props.class"
    >
        <slot />
    </nav>
</template>

<script lang="ts" setup>
import type { HTMLAttributes } from 'vue'

const props = defineProps<{
    class?: HTMLAttributes['class']
}>()
</script>
