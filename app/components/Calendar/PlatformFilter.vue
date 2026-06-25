<template>
    <Select :model-value="selectedAgent ?? ALL_VALUE" @update:model-value="handleSelect">
        <SelectTrigger class="h-9 min-w-[160px]">
            <SelectValue placeholder="All Platforms" />
        </SelectTrigger>
        <SelectContent>
            <SelectItem :value="ALL_VALUE">
                <span class="flex items-center gap-2">
                    <Icon name="lucide:globe" class="size-4" />
                    All Platforms
                </span>
            </SelectItem>
            <SelectItem
                v-for="platform in PROJECT_USAGE_PLATFORMS"
                :key="platform"
                :value="platform"
            >
                <span class="flex items-center gap-2">
                    <Icon :name="PROJECT_USAGE_PLATFORM_META[platform].aiIcon" class="size-4" />
                    {{ PROJECT_USAGE_PLATFORM_META[platform].label }}
                </span>
            </SelectItem>
        </SelectContent>
    </Select>
</template>

<script setup lang="ts">
import type { ProjectUsagePlatform } from '#shared/types/ai'
import type { AcceptableValue } from 'reka-ui'
import { PROJECT_USAGE_PLATFORM_META } from '#shared/platform/metadata'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'

defineProps<{ selectedAgent: ProjectUsagePlatform | null }>()

const emit = defineEmits<{ selectAgent: [agent: ProjectUsagePlatform | null] }>()

const ALL_VALUE = '__all__'

function handleSelect(value: AcceptableValue) {
    if (typeof value === 'string') {
        emit('selectAgent', value === ALL_VALUE ? null : value as ProjectUsagePlatform)
    }
}
</script>
