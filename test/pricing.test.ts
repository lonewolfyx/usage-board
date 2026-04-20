import { calculateUsageCostUSD, createLiteLLMPricingResolver, fetchLiteLLMPricingDataset } from '#shared/platform/pricing'
import { describe, expect, it, vi } from 'vitest'

describe('pricing', () => {
    it('falls back to embedded dataset when fetching LiteLLM pricing fails', async () => {
        const dataset = await fetchLiteLLMPricingDataset({
            fetcher: vi.fn(async () => {
                throw new Error('network error')
            }) as unknown as typeof fetch,
            forceRefresh: true,
            url: 'https://example.com/litellm.json',
        })

        expect(dataset['gpt-5']).toBeDefined()
        expect(dataset['gpt-5.4']?.output_cost_per_token).toBe(1.5e-5)
    })

    it('resolves alias pricing from LiteLLM dataset', async () => {
        const resolvePricing = await createLiteLLMPricingResolver({
            aliases: {
                'gpt-5.3-codex': 'gpt-5.2-codex',
            },
            fallbackModel: 'gpt-5',
            fetcher: vi.fn(async () => ({
                ok: true,
                json: async () => ({
                    'gpt-5.3-codex': {
                        input_cost_per_token: 0,
                        output_cost_per_token: 0,
                        cache_read_input_token_cost: 0,
                    },
                    'gpt-5.2-codex': {
                        input_cost_per_token: 1.75e-6,
                        output_cost_per_token: 1.4e-5,
                        cache_read_input_token_cost: 1.75e-7,
                    },
                }),
                status: 200,
                statusText: 'OK',
            })) as unknown as typeof fetch,
            forceRefresh: true,
            url: 'https://example.com/alias.json',
        })

        expect(resolvePricing('gpt-5.3-codex')).toEqual({
            cachedInputCostPerMTokens: 0.175,
            cachedInputCostPerMTokensAbove200K: undefined,
            cacheCreationInputCostPerMTokens: 1.75,
            cacheCreationInputCostPerMTokensAbove200K: undefined,
            fastMultiplier: undefined,
            inputCostPerMTokens: 1.75,
            inputCostPerMTokensAbove200K: undefined,
            outputCostPerMTokens: 14,
            outputCostPerMTokensAbove200K: undefined,
        })
    })

    it('calculates usage cost with shared helper', () => {
        const cost = calculateUsageCostUSD({
            inputTokens: 800,
            cachedInputTokens: 200,
            outputTokens: 500,
        }, {
            cachedInputCostPerMTokens: 0.125,
            cacheCreationInputCostPerMTokens: 1.25,
            inputCostPerMTokens: 1.25,
            outputCostPerMTokens: 10,
        })

        expect(cost).toBeCloseTo(
            (800 / 1_000_000) * 1.25
            + (200 / 1_000_000) * 0.125
            + (500 / 1_000_000) * 10,
            10,
        )
    })

    it('calculates Claude cache creation and tiered costs', () => {
        const cost = calculateUsageCostUSD({
            cacheCreationTokens: 300_000,
            cachedInputTokens: 250_000,
            inputTokens: 300_000,
            outputTokens: 250_000,
        }, {
            cachedInputCostPerMTokens: 0.3,
            cachedInputCostPerMTokensAbove200K: 0.6,
            cacheCreationInputCostPerMTokens: 3.75,
            cacheCreationInputCostPerMTokensAbove200K: 7.5,
            inputCostPerMTokens: 3,
            inputCostPerMTokensAbove200K: 6,
            outputCostPerMTokens: 15,
            outputCostPerMTokensAbove200K: 22.5,
        })

        expect(cost).toBeCloseTo(
            0.2 * 3 + 0.1 * 6
            + 0.2 * 15 + 0.05 * 22.5
            + 0.2 * 3.75 + 0.1 * 7.5
            + 0.2 * 0.3 + 0.05 * 0.6,
            10,
        )
    })
})
