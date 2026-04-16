<template>
    <div class="grid grid-cols-1 gap-4 md:grid-cols-12">
        <slot />
    </div>
</template>

<script setup lang="ts">
defineOptions({
    name: 'DashboardPanelGrid',
})
</script>
