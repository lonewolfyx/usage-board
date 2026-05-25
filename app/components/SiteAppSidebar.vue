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
                    </SidebarMenu>
                </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
                <SidebarGroupLabel>Agent</SidebarGroupLabel>
                <SidebarGroupContent>
                    <SidebarMenu>
                        <SidebarMenuItem v-for="item in dashboardProductNavItems" :key="item.label">
                            <SidebarMenuButton as-child :is-active="path === item.link" :tooltip="item.label">
                                <NuxtLink :to="item.link">
                                    <Icon
                                        :name="item.icon"
                                        class="size-5"
                                    />
                                    <span>{{ item.label }}</span>
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
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar'
import { dashboardProductNavItems } from '~/lib/dashboard-products'
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
