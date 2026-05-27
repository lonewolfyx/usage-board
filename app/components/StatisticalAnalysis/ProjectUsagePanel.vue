<template>
    <StatisticalAnalysisPanel
        description="Best performers by spend"
        icon="lucide:folder-git-2"
        title="Top Projects"
    >
        <div class="space-y-3">
            <div
                v-for="project in items"
                :key="project.repository"
                class="flex justify-between items-center gap-3 rounded-md transition-colors"
            >
                <div class="flex flex-col flex-1">
                    <p class="truncate text-sm font-medium tracking-tight">
                        {{ project.label }}
                    </p>
                    <p class="mt-1 truncate text-xs text-muted-foreground">
                        {{ project.detail }}
                    </p>
                </div>
                <div class="text-right">
                    <p class="text-xs font-medium tracking-tight tabular-nums">
                        {{ project.value }}
                    </p>
                </div>
            </div>
        </div>
    </StatisticalAnalysisPanel>
</template>

<script setup lang="ts">
defineOptions({
    name: 'StatisticalAnalysisProjectUsagePanel',
})

defineProps<{
    items: ProjectUsageItem[]
}>()
</script>
