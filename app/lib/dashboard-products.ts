import type { ProjectUsagePlatform } from '#shared/types/ai'
import type { NavItem } from '#shared/types/navigation'
import { DASHBOARD_VISIBLE_PLATFORM_PAGES } from '#shared/platform/dashboard'
import { PROJECT_USAGE_PLATFORM_META } from '#shared/platform/metadata'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'

export interface DashboardProductDefinition {
    icon: string
    name: string
    platformKey: ProjectUsagePlatform
    slug: string
}

const visiblePlatformPages = new Set<ProjectUsagePlatform>(DASHBOARD_VISIBLE_PLATFORM_PAGES)

const dashboardProducts: DashboardProductDefinition[] = PROJECT_USAGE_PLATFORMS
    .filter(platform => visiblePlatformPages.has(platform))
    .map(platform => ({
        icon: PROJECT_USAGE_PLATFORM_META[platform].aiIcon,
        name: PROJECT_USAGE_PLATFORM_META[platform].label,
        platformKey: platform,
        slug: PROJECT_USAGE_PLATFORM_META[platform].slug,
    }))

export const dashboardProductNavItems: NavItem[] = dashboardProducts.map(product => ({
    icon: product.icon,
    iconType: 'ai',
    label: product.name,
    link: `/${product.slug}`,
}))

export function getDashboardProductBySlug(slug: string) {
    return dashboardProducts.find(product => product.slug === slug)
}
