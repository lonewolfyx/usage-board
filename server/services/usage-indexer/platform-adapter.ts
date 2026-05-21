import type { IndexedUsageSessionFragment } from '#server/types/usage-indexer'
import type { ProjectUsagePlatform } from '#shared/types/ai'
import type { IConfig } from '#shared/types/config'
import type { ModelPricingResolver } from '#shared/types/platform'

export interface DiscoveredUsageFile {
    mtimeMs: number
    path: string
    platform: ProjectUsagePlatform
    size: number
}

export interface UsagePlatformAdapter {
    createPricingResolver: () => Promise<ModelPricingResolver>
    discoverFiles: (config: IConfig) => Promise<DiscoveredUsageFile[]>
    parseFile: (filePath: string, resolvePricing: ModelPricingResolver) => IndexedUsageSessionFragment[]
    watchPatterns: (config: IConfig) => string[]
}
