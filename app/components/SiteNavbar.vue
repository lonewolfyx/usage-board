<template>
    <header class="flex flex-col border-b z-10 mb-5">
        <div class="container mx-auto flex items-center justify-between gap-3">
            <div class="flex flex-col h-14">
                <div class="flex items-center gap-4 h-full">
                    <img alt="" class="size-8" src="/logo.svg">
                    <SiteLogo class="w-48 fill-foreground" />
                </div>
            </div>
            <div class="flex items-center">
                <GitHubLink />
                <ModeSwitcher />
            </div>
        </div>
        <Separator />
        <div class="container mx-auto flex items-center justify-between pt-3 pb-1">
            <NuxtLink
                v-for="item in navItems"
                :key="item.label"
                :class="getNavItemClass(item)"
                :to="item.link"
            >
                <Icon v-if="item.iconType === 'icon'" :name="item.icon" class="size-5" mode="svg" />
                <IconAi v-else :name="item.icon as AiIconName" />
                <span class="capitalize text-xs font-medium font-mono">{{ item.label }}</span>
            </nuxtlink>
        </div>
    </header>
</template>

<script lang="ts" setup>
import type { AiIconName, NavItem } from '#shared/types/navigation'
import { dashboardProductNavItems } from '~/lib/dashboard-products'
import { cn } from '~/lib/utils'

defineOptions({
    name: 'SiteNavbar',
})

const navItems = [
    {
        icon: 'solar:home-bold-duotone',
        iconType: 'icon',
        label: 'home',
        link: '/',
    },
    ...dashboardProductNavItems,
    // {
    //     icon: 'kimi_code',
    //     iconFillClass: '[&_svg]:fill-foreground/50',
    //     iconType: 'ai',
    //     label: 'Kimi',
    //     link: '/kimi',
    // },
    // {
    //     icon: 'antigravity',
    //     iconFillClass: '[&_svg]:fill-foreground/50',
    //     iconType: 'ai',
    //     label: 'antigravity',
    //     link: '/antigravity',
    // },
    // {
    //     icon: 'amp',
    //     iconFillClass: '[&_path]:fill-current!',
    //     iconType: 'ai',
    //     label: 'amp',
    //     link: '/amp',
    // },
    {
        icon: 'ri:apps-ai-line',
        iconType: 'icon',
        label: 'Project',
        link: '/project',
    },
] satisfies NavItem[]

const route = useRoute()

const path = computed(() => route.path)

function getNavItemClass(item: NavItem) {
    const isActive = path.value === item.link
    const inactiveIconClass = item.iconFillClass ?? (item.iconType === 'ai' ? '[&_svg]:fill-foreground/50' : '')

    return cn(
        'relative flex flex-col items-center gap-1.5',
        isActive
            ? [
                    'after:content-[\'\'] after:absolute after:w-full after:h-px after:bg-amber-500',
                    'after:-bottom-1 after:rounded-2xl',
                ]
            : [
                    'text-foreground/50',
                    inactiveIconClass,
                ],
    )
}
</script>

<style scoped>

</style>
