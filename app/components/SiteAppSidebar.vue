<template>
    <Sidebar class="border-0!" v-bind="props" collapsible="icon">
        <SidebarHeader>
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton size="lg">
                        <div
                            class="flex aspect-square size-8 items-center justify-center rounded-lg text-sidebar-primary-foreground"
                        >
                            <Icon class="size-8" name="ai:logo" />
                        </div>
                        <div class="grid flex-1 text-left h-full items-center">
                            <span class="truncate font-semibold mt-2">
                                <SiteLogo class="w-44 fill-foreground" />
                            </span>
                        </div>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
            <SidebarGroup>
                <SidebarGroupLabel>App</SidebarGroupLabel>
                <SidebarGroupContent>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton tooltip="dashboard" as-child :is-active="path === '/'">
                                <NuxtLink to="/">
                                    <Icon name="stash:dashboard" class="size-5" />
                                    <span>Dashboard</span>
                                </NuxtLink>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton tooltip="project" as-child :is-active="path === '/project'">
                                <NuxtLink to="/project">
                                    <Icon name="ri:apps-ai-line" class="size-5" />
                                    <span>Project</span>
                                </NuxtLink>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton tooltip="calendar" as-child :is-active="path === '/calendar'">
                                <NuxtLink to="/calendar">
                                    <Icon name="lucide:calendar-days" class="size-5" />
                                    <span>Calendar</span>
                                </NuxtLink>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
                <SidebarGroupLabel>Agent</SidebarGroupLabel>
                <SidebarGroupContent>
                    <SidebarMenu>
                        <SidebarMenuItem v-for="platform in PROJECT_USAGE_PLATFORMS" :key="platform">
                            <SidebarMenuButton
                                as-child
                                :is-active="path === `/${PROJECT_USAGE_PLATFORM_META[platform].slug}`"
                                :tooltip="PROJECT_USAGE_PLATFORM_META[platform].label"
                            >
                                <NuxtLink :to="`/${PROJECT_USAGE_PLATFORM_META[platform].slug}`">
                                    <Icon :name="PROJECT_USAGE_PLATFORM_META[platform].aiIcon" class="dark:hidden size-5" />
                                    <Icon :name="`${PROJECT_USAGE_PLATFORM_META[platform].aiIcon}-dark`" class="hidden dark:inline-block size-5" />
                                    <span>{{ PROJECT_USAGE_PLATFORM_META[platform].label }}</span>
                                </NuxtLink>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarGroupContent>
            </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
            <div
                :class="cn(
                    'flex group-data-[collapsible=icon]:flex-col',
                    'justify-between items-center',
                    'transition duration-300',
                )"
            >
                <GitHubLink />
                <ModeSwitcher />
            </div>
        </SidebarFooter>
    </Sidebar>
</template>

<script lang="ts" setup>
import type { SidebarProps } from '@/components/ui/sidebar'
import { PROJECT_USAGE_PLATFORM_META } from '#shared/platform/metadata'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar'
import { cn } from '~/lib/utils'

defineOptions({
    name: 'SiteAppSidebar',
})
const props = withDefaults(defineProps<SidebarProps>(), {
    collapsible: 'icon',
})

const route = useRoute()
const path = computed(() => route.path)
</script>
