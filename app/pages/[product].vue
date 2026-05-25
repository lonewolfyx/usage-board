<template>
    <DashboardProductPage
        :product-key="platform"
        :product-name="PROJECT_USAGE_PLATFORM_META[platform].label"
    />
</template>

<script setup lang="ts">
import { PROJECT_USAGE_PLATFORM_META, resolveProjectUsagePlatform } from '#shared/platform/metadata'

definePageMeta({
    validate: route => typeof route.params.product === 'string'
        && Boolean(resolveProjectUsagePlatform(route.params.product)),
})

const route = useRoute()
const platform = resolveProjectUsagePlatform(route.params.product as string)

if (!platform) {
    throw createError({
        status: 404,
        message: 'Page not found',
    })
}
</script>
