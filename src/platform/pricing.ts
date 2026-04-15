import type {
    CreateLiteLLMPricingResolverOptions,
    FetchLiteLLMPricingDatasetOptions,
    LiteLLMModelPricing,
    LiteLLMPricingDataset,
    ModelPricing,
    ModelPricingResolver,
    PricingCacheEntry,
    TokenCostUsage,
} from '~~/src/types'

const MILLION = 1_000_000
const DEFAULT_PRICING_CACHE_TTL_MS = 1000 * 60 * 5
const DEFAULT_LITELLM_PRICING_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

const DEFAULT_FALLBACK_PRICING_TABLE: Record<string, ModelPricing> = {
    'gpt-5': {
        cachedInputCostPerMTokens: 0.125,
        inputCostPerMTokens: 1.25,
        outputCostPerMTokens: 10,
    },
    'gpt-5.2-codex': {
        cachedInputCostPerMTokens: 0.175,
        inputCostPerMTokens: 1.75,
        outputCostPerMTokens: 14,
    },
    'gpt-5.4': {
        cachedInputCostPerMTokens: 0.25,
        inputCostPerMTokens: 2.5,
        outputCostPerMTokens: 15,
    },
}

const pricingCache = new Map<string, PricingCacheEntry>()

export async function fetchLiteLLMPricingDataset(options: FetchLiteLLMPricingDatasetOptions = {}): Promise<LiteLLMPricingDataset> {
    const url = options.url ?? DEFAULT_LITELLM_PRICING_URL
    const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_PRICING_CACHE_TTL_MS
    const now = Date.now()
    const cacheEntry = pricingCache.get(url)

    if (!options.forceRefresh && cacheEntry?.value && now - cacheEntry.fetchedAt < cacheTtlMs) {
        return cacheEntry.value
    }

    if (!options.forceRefresh && cacheEntry?.promise) {
        return cacheEntry.promise
    }

    const fetcher = options.fetcher ?? globalThis.fetch

    if (typeof fetcher !== 'function') {
        return createFallbackLiteLLMPricingDataset()
    }

    const promise = fetcher(url)
        .then(async (response) => {
            if (!response.ok) {
                throw new Error(`Failed to fetch LiteLLM pricing dataset: ${response.status} ${response.statusText}`)
            }

            const data = await response.json()

            if (!isLiteLLMPricingDataset(data)) {
                throw new Error('Invalid LiteLLM pricing dataset payload.')
            }

            const dataset = {
                ...createFallbackLiteLLMPricingDataset(),
                ...data,
            }

            pricingCache.set(url, {
                fetchedAt: Date.now(),
                value: dataset,
            })

            return dataset
        })
        .catch(() => {
            const fallback = createFallbackLiteLLMPricingDataset()
            pricingCache.set(url, {
                fetchedAt: Date.now(),
                value: fallback,
            })

            return fallback
        })

    pricingCache.set(url, {
        fetchedAt: cacheEntry?.fetchedAt ?? 0,
        promise,
        value: cacheEntry?.value,
    })

    return promise
}

export async function createLiteLLMPricingResolver(options: CreateLiteLLMPricingResolverOptions = {}): Promise<ModelPricingResolver> {
    const dataset = await fetchLiteLLMPricingDataset(options)
    const aliases = options.aliases ?? {}
    const fallbackPricingTable = {
        ...DEFAULT_FALLBACK_PRICING_TABLE,
        ...(options.fallbackPricingTable ?? {}),
    }
    const getLookupCandidates = options.getLookupCandidates ?? defaultLookupCandidates
    const fallbackModel = options.fallbackModel
    const isZeroCostModel = options.isZeroCostModel ?? (() => false)

    return (model: string) => {
        if (isZeroCostModel(model)) {
            return createZeroPricing()
        }

        const lookupCandidates = uniqueItems(expandLookupCandidates(model, aliases, getLookupCandidates))
        const datasetPricing = resolveDatasetPricing(dataset, lookupCandidates)

        if (datasetPricing) {
            return datasetPricing
        }

        const fallbackPricing = resolveFallbackPricing(fallbackPricingTable, lookupCandidates)

        if (fallbackPricing) {
            return fallbackPricing
        }

        if (fallbackModel) {
            const fallbackCandidates = uniqueItems(expandLookupCandidates(fallbackModel, aliases, getLookupCandidates))

            return resolveDatasetPricing(dataset, fallbackCandidates)
                ?? resolveFallbackPricing(fallbackPricingTable, fallbackCandidates)
                ?? createZeroPricing()
        }

        return createZeroPricing()
    }
}

export function calculateUsageCostUSD(usage: TokenCostUsage, pricing: ModelPricing): number {
    const inputCost = (Math.max(usage.inputTokens, 0) / MILLION) * pricing.inputCostPerMTokens
    const cachedCost = (Math.max(usage.cachedInputTokens, 0) / MILLION) * pricing.cachedInputCostPerMTokens
    const outputCost = (Math.max(usage.outputTokens, 0) / MILLION) * pricing.outputCostPerMTokens

    return inputCost + cachedCost + outputCost
}

function createFallbackLiteLLMPricingDataset(): LiteLLMPricingDataset {
    return {
        'gpt-5': {
            input_cost_per_token: 1.25e-6,
            output_cost_per_token: 1e-5,
            cache_read_input_token_cost: 1.25e-7,
        },
        'gpt-5.2-codex': {
            input_cost_per_token: 1.75e-6,
            output_cost_per_token: 1.4e-5,
            cache_read_input_token_cost: 1.75e-7,
        },
        'gpt-5.4': {
            input_cost_per_token: 2.5e-6,
            output_cost_per_token: 1.5e-5,
            cache_read_input_token_cost: 2.5e-7,
        },
    }
}

function isLiteLLMPricingDataset(value: unknown): value is LiteLLMPricingDataset {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false
    }

    return true
}

function defaultLookupCandidates(model: string) {
    const normalizedModel = model.trim()

    return [
        normalizedModel,
        normalizedModel.replace(/^openai\//u, ''),
        normalizedModel.replace(/^azure\//u, ''),
        normalizedModel.replace(/^openrouter\/openai\//u, ''),
    ]
}

function expandLookupCandidates(
    model: string,
    aliases: Record<string, string>,
    getLookupCandidates: (model: string) => string[],
) {
    const candidates = getLookupCandidates(model)
    const expanded = [...candidates]

    for (const candidate of candidates) {
        const alias = aliases[candidate]

        if (alias) {
            expanded.push(...getLookupCandidates(alias))
        }
    }

    return expanded
}

function resolveDatasetPricing(dataset: LiteLLMPricingDataset, candidates: string[]) {
    for (const candidate of candidates) {
        const pricing = dataset[candidate]

        if (!pricing || !hasNonZeroTokenPricing(pricing)) {
            continue
        }

        return toModelPricing(pricing)
    }

    return null
}

function resolveFallbackPricing(fallbackPricingTable: Record<string, ModelPricing>, candidates: string[]) {
    for (const candidate of candidates) {
        const pricing = fallbackPricingTable[candidate]

        if (pricing) {
            return pricing
        }
    }

    return null
}

function hasNonZeroTokenPricing(pricing: LiteLLMModelPricing) {
    return (pricing.input_cost_per_token ?? 0) > 0
        || (pricing.output_cost_per_token ?? 0) > 0
        || (pricing.cache_read_input_token_cost ?? 0) > 0
}

function toModelPricing(pricing: LiteLLMModelPricing): ModelPricing {
    const inputCostPerToken = pricing.input_cost_per_token ?? 0
    const cachedInputCostPerToken = pricing.cache_read_input_token_cost ?? inputCostPerToken
    const outputCostPerToken = pricing.output_cost_per_token ?? 0

    return {
        cachedInputCostPerMTokens: cachedInputCostPerToken * MILLION,
        inputCostPerMTokens: inputCostPerToken * MILLION,
        outputCostPerMTokens: outputCostPerToken * MILLION,
    }
}

function createZeroPricing(): ModelPricing {
    return {
        cachedInputCostPerMTokens: 0,
        inputCostPerMTokens: 0,
        outputCostPerMTokens: 0,
    }
}

function uniqueItems(items: string[]) {
    return Array.from(new Set(items.filter(Boolean)))
}
