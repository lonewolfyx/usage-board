import { describe, expect, it, vi } from 'vitest'
import { calculateUsageCostUSD, createLiteLLMPricingResolver, fetchLiteLLMPricingDataset } from '../src/platform/pricing'

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
            inputCostPerMTokens: 1.75,
            outputCostPerMTokens: 14,
        })
    })

    it('calculates usage cost with shared helper', () => {
        const cost = calculateUsageCostUSD({
            inputTokens: 800,
            cachedInputTokens: 200,
            outputTokens: 500,
        }, {
            cachedInputCostPerMTokens: 0.125,
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
})
