import type { ProjectUsagePlatform } from '#shared/types/ai'
import type { AiIconName, NavItem } from '#shared/types/navigation'

export interface DashboardProductDefinition {
    icon: AiIconName
    name: string
    payloadKey: ProjectUsagePlatform
    slug: string
}

const dashboardProducts: DashboardProductDefinition[] = [
    {
        icon: 'claude_code',
        name: 'Claude Code',
        payloadKey: 'claudeCode',
        slug: 'claude_code',
    },
    {
        icon: 'codex',
        name: 'Codex',
        payloadKey: 'codex',
        slug: 'codex',
    },
    {
        icon: 'gemini',
        name: 'Gemini',
        payloadKey: 'gemini',
        slug: 'gemini',
    },
]

export const dashboardProductNavItems: NavItem[] = dashboardProducts.map(product => ({
    icon: product.icon,
    iconType: 'ai',
    label: product.name,
    link: `/${product.slug}`,
}))

export function getDashboardProductBySlug(slug: string) {
    return dashboardProducts.find(product => product.slug === slug)
}
