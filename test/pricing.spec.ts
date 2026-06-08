import { describe, expect, it } from 'vitest'
import { calculateUsageCostUSD } from '../shared/platform/pricing'

describe('calculateUsageCostUSD', () => {
    it('calculates basic input + output cost', () => {
        const cost = calculateUsageCostUSD({
            cacheCreationTokens: 0,
            cachedInputTokens: 200,
            inputTokens: 1000,
            outputTokens: 500,
        }, {
            cachedInputCostPerMTokens: 0.3,
            cacheCreationInputCostPerMTokens: 3.75,
            inputCostPerMTokens: 3,
            outputCostPerMTokens: 15,
        })
        // (1000*3 + 500*15 + 200*0.3 + 0*3.75) / 1_000_000 = 0.01056
        expect(cost).toBeCloseTo(0.01056)
    })

    it('applies tiered pricing above 200K input tokens', () => {
        const cost = calculateUsageCostUSD({
            cacheCreationTokens: 0,
            cachedInputTokens: 0,
            inputTokens: 300_000,
            outputTokens: 0,
        }, {
            cachedInputCostPerMTokens: 0,
            cacheCreationInputCostPerMTokens: 0,
            inputCostPerMTokens: 3,
            inputCostPerMTokensAbove200K: 6,
            outputCostPerMTokens: 0,
        })
        // 200K * 3/M + 100K * 6/M = 0.6 + 0.6 = 1.2
        expect(cost).toBeCloseTo(1.2)
    })

    it('applies tiered pricing above 200K output tokens', () => {
        const cost = calculateUsageCostUSD({
            cacheCreationTokens: 0,
            cachedInputTokens: 0,
            inputTokens: 0,
            outputTokens: 300_000,
        }, {
            cachedInputCostPerMTokens: 0,
            cacheCreationInputCostPerMTokens: 0,
            inputCostPerMTokens: 0,
            outputCostPerMTokens: 15,
            outputCostPerMTokensAbove200K: 22.5,
        })
        // 200K * 15/M + 100K * 22.5/M = 3.0 + 2.25 = 5.25
        expect(cost).toBeCloseTo(5.25)
    })

    it('applies fast multiplier from pricing', () => {
        const pricing = {
            cachedInputCostPerMTokens: 0,
            cacheCreationInputCostPerMTokens: 0,
            fastMultiplier: 6,
            inputCostPerMTokens: 5,
            outputCostPerMTokens: 25,
        }
        const standard = calculateUsageCostUSD({
            cacheCreationTokens: 0,
            cachedInputTokens: 0,
            inputTokens: 1000,
            outputTokens: 1000,
        }, pricing)
        const fast = calculateUsageCostUSD({
            cacheCreationTokens: 0,
            cachedInputTokens: 0,
            inputTokens: 1000,
            outputTokens: 1000,
        }, pricing, { speed: 'fast' })
        expect(fast).toBeCloseTo(standard * 6)
    })

    it('applies defaultFastMultiplier when pricing has no fastMultiplier', () => {
        const pricing = {
            cachedInputCostPerMTokens: 0,
            cacheCreationInputCostPerMTokens: 0,
            inputCostPerMTokens: 5,
            outputCostPerMTokens: 25,
        }
        const standard = calculateUsageCostUSD({
            cacheCreationTokens: 0,
            cachedInputTokens: 0,
            inputTokens: 1000,
            outputTokens: 1000,
        }, pricing)
        const fast = calculateUsageCostUSD({
            cacheCreationTokens: 0,
            cachedInputTokens: 0,
            inputTokens: 1000,
            outputTokens: 1000,
        }, pricing, { defaultFastMultiplier: 2, speed: 'fast' })
        expect(fast).toBeCloseTo(standard * 2)
    })

    it('returns 0 for zero tokens', () => {
        const cost = calculateUsageCostUSD({
            cacheCreationTokens: 0,
            cachedInputTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
        }, {
            cachedInputCostPerMTokens: 3,
            cacheCreationInputCostPerMTokens: 3,
            inputCostPerMTokens: 3,
            outputCostPerMTokens: 15,
        })
        expect(cost).toBe(0)
    })

    it('handles cache creation tokens', () => {
        const cost = calculateUsageCostUSD({
            cacheCreationTokens: 1000,
            cachedInputTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
        }, {
            cachedInputCostPerMTokens: 0,
            cacheCreationInputCostPerMTokens: 3.75,
            inputCostPerMTokens: 0,
            outputCostPerMTokens: 0,
        })
        // 1000 * 3.75 / 1_000_000 = 0.00375
        expect(cost).toBeCloseTo(0.00375)
    })

    it('handles cached input tokens', () => {
        const cost = calculateUsageCostUSD({
            cacheCreationTokens: 0,
            cachedInputTokens: 1000,
            inputTokens: 0,
            outputTokens: 0,
        }, {
            cachedInputCostPerMTokens: 0.3,
            cacheCreationInputCostPerMTokens: 0,
            inputCostPerMTokens: 0,
            outputCostPerMTokens: 0,
        })
        // 1000 * 0.3 / 1_000_000 = 0.0003
        expect(cost).toBeCloseTo(0.0003)
    })
})
