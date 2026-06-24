import type { ProjectUsagePlatform } from '#shared/types/ai'
import { PROJECT_USAGE_PLATFORMS } from '#shared/types/ai'

export interface UsageSessionIdentityInput {
    platform: ProjectUsagePlatform | string
    repository: string
    sessionId: string
}

export interface UsageInteractionIdentityInput extends UsageSessionIdentityInput {
    interactionIndex: number
    sourceFile: string
}

export function createUsageSessionIdentity(input: UsageSessionIdentityInput) {
    return JSON.stringify([input.platform, input.repository, input.sessionId])
}

export function createUsageInteractionIdentity(input: UsageInteractionIdentityInput) {
    return JSON.stringify([input.platform, input.repository, input.sessionId, input.sourceFile, input.interactionIndex])
}

export function inferUsageSessionIdentityPlatform(identity: string): ProjectUsagePlatform | null {
    try {
        const value = JSON.parse(identity)

        if (Array.isArray(value) && PROJECT_USAGE_PLATFORMS.includes(value[0] as ProjectUsagePlatform)) {
            return value[0] as ProjectUsagePlatform
        }
    }
    catch {
        const legacyPlatform = PROJECT_USAGE_PLATFORMS.find(platform => identity.startsWith(`${platform}:`))

        if (legacyPlatform) {
            return legacyPlatform
        }
    }

    return null
}
