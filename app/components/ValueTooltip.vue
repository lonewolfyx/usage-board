<template>
    <slot v-if="!content" />

    <Tooltip v-else>
        <TooltipTrigger as-child>
            <slot />
        </TooltipTrigger>

        <TooltipContent side="top">
            <p class="max-w-64 leading-relaxed">
                {{ content }}
            </p>
        </TooltipContent>
    </Tooltip>
</template>

<script setup lang="ts">
defineOptions({
    name: 'ValueTooltip',
})

defineProps<{
    content?: string
}>()
</script>
