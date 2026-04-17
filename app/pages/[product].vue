<template>
    <DashboardProductPage
        :product-key="product.payloadKey"
        :product-name="product.name"
    />
</template>

<script setup lang="ts">
import { getDashboardProductBySlug } from '~/lib/dashboard-products'

definePageMeta({
    validate: route => typeof route.params.product === 'string'
        && Boolean(getDashboardProductBySlug(route.params.product)),
})

const route = useRoute()
const product = getDashboardProductBySlug(route.params.product as string)

if (!product) {
    throw createError({
        status: 404,
        message: 'Page not found',
    })
}
</script>
