<template>
    <Card :class="cn('shadow-none bg-transparent', compact ? 'gap-3 py-4' : 'gap-4 py-5')">
        <CardHeader :class="cn(compact ? 'px-4' : 'px-5')">
            <div class="flex items-start justify-between gap-4">
                <div class="min-w-0 space-y-1">
                    <CardTitle :class="compact ? 'text-xs font-medium text-muted-foreground uppercase tracking-wide' : 'text-base'">
                        {{ title }}
                    </CardTitle>
                    <p v-if="description" class="text-sm text-muted-foreground">
                        {{ description }}
                    </p>
                </div>
                <div
                    v-if="icon"
                    :class="cn(
                        'shrink-0 rounded-lg bg-secondary text-secondary-foreground flex items-center justify-center',
                        compact ? 'size-7' : 'size-8',
                    )"
                >
                    <Icon mode="svg" :name="icon" :class="compact ? 'size-3.5' : 'size-4'" />
                </div>
            </div>
        </CardHeader>
        <CardContent :class="cn(compact ? 'px-4' : 'px-5')">
            <slot />
        </CardContent>
    </Card>
</template>

<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

defineOptions({
    name: 'StatisticalAnalysisPanel',
})

defineProps<{
    compact?: boolean
    description?: string
    icon?: string
    title: string
}>()
</script>
