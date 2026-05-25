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
                v-for="item in primaryNavItems"
                :key="item.label"
                :class="getNavItemClass(item)"
                :to="item.link"
            >
                <Icon :name="item.icon" class="size-5" mode="svg" />
                <span class="capitalize text-xs font-medium font-mono">{{ item.label }}</span>
            </nuxtlink>
            <NuxtLink
                v-for="platform in PROJECT_USAGE_PLATFORMS"
                :key="platform"
                :class="getNavItemClass({
                    icon: PROJECT_USAGE_PLATFORM_META[platform].aiIcon,
                    iconType: 'ai',
                    label: PROJECT_USAGE_PLATFORM_META[platform].label,
                    link: `/${PROJECT_USAGE_PLATFORM_META[platform].slug}`,
                })"
                :to="`/${PROJECT_USAGE_PLATFORM_META[platform].slug}`"
            >
                <Icon :name="PROJECT_USAGE_PLATFORM_META[platform].aiIcon" class="size-5" />
                <span class="capitalize text-xs font-medium font-mono">{{ PROJECT_USAGE_PLATFORM_META[platform].label }}</span>
            </NuxtLink>
            <NuxtLink
                v-for="item in trailingNavItems"
                :key="item.label"
                :class="getNavItemClass(item)"
                :to="item.link"
            >
                <Icon :name="item.icon" class="size-5" mode="svg" />
                <span class="capitalize text-xs font-medium font-mono">{{ item.label }}</span>
            </NuxtLink>
        </div>
    </header>
</template>

<script lang="ts" setup>
import type { NavItem } from '#shared/types/navigation'
import { PROJECT_USAGE_PLATFORM_META } from '#shared/platform/metadata'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'
import { cn } from '~/lib/utils'

defineOptions({
    name: 'SiteNavbar',
})

const primaryNavItems = [
    {
        icon: 'solar:home-bold-duotone',
        iconType: 'icon',
        label: 'home',
        link: '/',
    },
] satisfies NavItem[]

const trailingNavItems = [
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
