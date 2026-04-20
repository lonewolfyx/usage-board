import type {
    CreateLiteLLMPricingResolverOptions,
    FetchLiteLLMPricingDatasetOptions,
    LiteLLMModelPricing,
    LiteLLMPricingDataset,
    ModelPricing,
    ModelPricingResolver,
    PricingCacheEntry,
    TokenCostUsage,
} from '#shared/types/platform'

/** Multiplier used to convert per-token prices into per-million-token prices. */
const MILLION = 1_000_000

/** Default in-memory cache duration for LiteLLM pricing data, in milliseconds. */
const DEFAULT_PRICING_CACHE_TTL_MS = 1000 * 60 * 5

/** Official LiteLLM model pricing URL; local fallback prices are used when the request fails. */
const DEFAULT_LITELLM_PRICING_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

/** Built-in fallback prices so common models can still be estimated offline or when remote data is missing. */
const DEFAULT_FALLBACK_PRICING_TABLE: Record<string, ModelPricing> = {
    'gpt-5': {
        cachedInputCostPerMTokens: 0.125,
        cacheCreationInputCostPerMTokens: 1.25,
        inputCostPerMTokens: 1.25,
        outputCostPerMTokens: 10,
    },
    'gpt-5.2-codex': {
        cachedInputCostPerMTokens: 0.175,
        cacheCreationInputCostPerMTokens: 1.75,
        inputCostPerMTokens: 1.75,
        outputCostPerMTokens: 14,
    },
    'gpt-5.4': {
        cachedInputCostPerMTokens: 0.25,
        cacheCreationInputCostPerMTokens: 2.5,
        inputCostPerMTokens: 2.5,
        outputCostPerMTokens: 15,
    },
    'claude-haiku-4-5': {
        cachedInputCostPerMTokens: 0.1,
        cacheCreationInputCostPerMTokens: 1.25,
        inputCostPerMTokens: 1,
        outputCostPerMTokens: 5,
    },
    'claude-opus-4-1': {
        cachedInputCostPerMTokens: 1.5,
        cachedInputCostPerMTokensAbove200K: 3,
        cacheCreationInputCostPerMTokens: 18.75,
        cacheCreationInputCostPerMTokensAbove200K: 37.5,
        inputCostPerMTokens: 15,
        inputCostPerMTokensAbove200K: 30,
        outputCostPerMTokens: 75,
        outputCostPerMTokensAbove200K: 112.5,
    },
    'claude-sonnet-4-5': {
        cachedInputCostPerMTokens: 0.3,
        cachedInputCostPerMTokensAbove200K: 0.6,
        cacheCreationInputCostPerMTokens: 3.75,
        cacheCreationInputCostPerMTokensAbove200K: 7.5,
        inputCostPerMTokens: 3,
        inputCostPerMTokensAbove200K: 6,
        outputCostPerMTokens: 15,
        outputCostPerMTokensAbove200K: 22.5,
    },
}

/** Caches fetched datasets and in-flight requests by pricing URL to avoid duplicate network calls. */
const pricingCache = new Map<string, PricingCacheEntry>()

/**
 * Fetches the LiteLLM model pricing dataset and falls back to the built-in dataset on failure.
 *
 * @example
 * ```ts
 * const dataset = await fetchLiteLLMPricingDataset()
 * console.log(dataset['gpt-5']?.input_cost_per_token)
 * ```
 */
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

/**
 * Creates a model pricing resolver with support for aliases, platform-specific lookup candidates, fallback models, and zero-cost models.
 *
 * @example
 * ```ts
 * const resolvePricing = await createLiteLLMPricingResolver({
 *     aliases: { 'gpt-5-codex': 'gpt-5' },
 *     fallbackModel: 'gpt-5',
 * })
 * const pricing = resolvePricing('gpt-5-codex')
 * ```
 */
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

/**
 * Calculates USD cost from token usage and model pricing.
 *
 * @example
 * ```ts
 * const costUSD = calculateUsageCostUSD({
 *     cachedInputTokens: 100,
 *     inputTokens: 1_000,
 *     outputTokens: 500,
 * }, pricing)
 * ```
 */
export function calculateUsageCostUSD(usage: TokenCostUsage, pricing: ModelPricing, options: { speed?: 'fast' | 'standard' } = {}): number {
    const multiplier = options.speed === 'fast' ? (pricing.fastMultiplier ?? 1) : 1
    const inputCost = calculateTieredCost(usage.inputTokens, pricing.inputCostPerMTokens, pricing.inputCostPerMTokensAbove200K)
    const cachedCost = calculateTieredCost(usage.cachedInputTokens, pricing.cachedInputCostPerMTokens, pricing.cachedInputCostPerMTokensAbove200K)
    const cacheCreationCost = calculateTieredCost(usage.cacheCreationTokens ?? 0, pricing.cacheCreationInputCostPerMTokens, pricing.cacheCreationInputCostPerMTokensAbove200K)
    const outputCost = calculateTieredCost(usage.outputTokens, pricing.outputCostPerMTokens, pricing.outputCostPerMTokensAbove200K)

    return (inputCost + cachedCost + cacheCreationCost + outputCost) * multiplier
}

/**
 * Builds the minimal LiteLLM pricing dataset used as a local fallback.
 *
 * @example
 * ```ts
 * const fallbackDataset = createFallbackLiteLLMPricingDataset()
 * ```
 */
function createFallbackLiteLLMPricingDataset(): LiteLLMPricingDataset {
    return {
        'gpt-5': {
            input_cost_per_token: 1.25e-6,
            output_cost_per_token: 1e-5,
            cache_creation_input_token_cost: 1.25e-6,
            cache_read_input_token_cost: 1.25e-7,
        },
        'gpt-5.2-codex': {
            input_cost_per_token: 1.75e-6,
            output_cost_per_token: 1.4e-5,
            cache_creation_input_token_cost: 1.75e-6,
            cache_read_input_token_cost: 1.75e-7,
        },
        'gpt-5.4': {
            input_cost_per_token: 2.5e-6,
            output_cost_per_token: 1.5e-5,
            cache_creation_input_token_cost: 2.5e-6,
            cache_read_input_token_cost: 2.5e-7,
        },
        'claude-haiku-4-5': {
            input_cost_per_token: 1e-6,
            output_cost_per_token: 5e-6,
            cache_creation_input_token_cost: 1.25e-6,
            cache_read_input_token_cost: 1e-7,
        },
        'claude-opus-4-1': {
            input_cost_per_token: 15e-6,
            output_cost_per_token: 75e-6,
            cache_creation_input_token_cost: 18.75e-6,
            cache_read_input_token_cost: 1.5e-6,
            input_cost_per_token_above_200k_tokens: 30e-6,
            output_cost_per_token_above_200k_tokens: 112.5e-6,
            cache_creation_input_token_cost_above_200k_tokens: 37.5e-6,
            cache_read_input_token_cost_above_200k_tokens: 3e-6,
        },
        'claude-sonnet-4-5': {
            input_cost_per_token: 3e-6,
            output_cost_per_token: 15e-6,
            cache_creation_input_token_cost: 3.75e-6,
            cache_read_input_token_cost: 0.3e-6,
            input_cost_per_token_above_200k_tokens: 6e-6,
            output_cost_per_token_above_200k_tokens: 22.5e-6,
            cache_creation_input_token_cost_above_200k_tokens: 7.5e-6,
            cache_read_input_token_cost_above_200k_tokens: 0.6e-6,
        },
    }
}

/**
 * Checks whether an unknown payload can be treated as a LiteLLM pricing dataset.
 *
 * @example
 * ```ts
 * if (isLiteLLMPricingDataset(payload)) {
 *     console.log(Object.keys(payload))
 * }
 * ```
 */
function isLiteLLMPricingDataset(value: unknown): value is LiteLLMPricingDataset {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false
    }

    return true
}

/**
 * Generates model lookup candidates for common OpenAI, Azure, and OpenRouter prefixes.
 *
 * @example
 * ```ts
 * const candidates = defaultLookupCandidates('openai/gpt-5')
 * ```
 */
function defaultLookupCandidates(model: string) {
    const normalizedModel = model.trim()

    return [
        normalizedModel,
        normalizedModel.replace(/^openai\//u, ''),
        normalizedModel.replace(/^azure\//u, ''),
        normalizedModel.replace(/^openrouter\/openai\//u, ''),
    ]
}

/**
 * Expands platform lookup candidates and explicit aliases into a full lookup list.
 *
 * @example
 * ```ts
 * expandLookupCandidates('gpt-5-codex', { 'gpt-5-codex': 'gpt-5' }, defaultLookupCandidates)
 * ```
 */
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

/**
 * Resolves billable pricing from a LiteLLM dataset using candidate model names.
 *
 * @example
 * ```ts
 * const pricing = resolveDatasetPricing(dataset, ['gpt-5-codex', 'gpt-5'])
 * ```
 */
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

/**
 * Resolves pricing from the local fallback table using candidate model names.
 *
 * @example
 * ```ts
 * const pricing = resolveFallbackPricing(DEFAULT_FALLBACK_PRICING_TABLE, ['claude-sonnet-4-5'])
 * ```
 */
function resolveFallbackPricing(fallbackPricingTable: Record<string, ModelPricing>, candidates: string[]) {
    for (const candidate of candidates) {
        const pricing = fallbackPricingTable[candidate]

        if (pricing) {
            return pricing
        }
    }

    return null
}

/**
 * Checks whether a LiteLLM pricing entry contains at least one non-zero token price.
 *
 * @example
 * ```ts
 * hasNonZeroTokenPricing({ input_cost_per_token: 1e-6 })
 * // true
 * ```
 */
function hasNonZeroTokenPricing(pricing: LiteLLMModelPricing) {
    return (pricing.input_cost_per_token ?? 0) > 0
        || (pricing.output_cost_per_token ?? 0) > 0
        || (pricing.cache_creation_input_token_cost ?? 0) > 0
        || (pricing.cache_read_input_token_cost ?? 0) > 0
}

/**
 * Converts LiteLLM per-token price fields into the app's per-million-token pricing shape.
 *
 * @example
 * ```ts
 * const pricing = toModelPricing({ input_cost_per_token: 1e-6, output_cost_per_token: 2e-6 })
 * ```
 */
function toModelPricing(pricing: LiteLLMModelPricing): ModelPricing {
    const inputCostPerToken = pricing.input_cost_per_token ?? 0
    const cachedInputCostPerToken = pricing.cache_read_input_token_cost ?? inputCostPerToken
    const cacheCreationInputCostPerToken = pricing.cache_creation_input_token_cost ?? inputCostPerToken
    const outputCostPerToken = pricing.output_cost_per_token ?? 0

    return {
        cachedInputCostPerMTokens: cachedInputCostPerToken * MILLION,
        cachedInputCostPerMTokensAbove200K: pricing.cache_read_input_token_cost_above_200k_tokens != null
            ? pricing.cache_read_input_token_cost_above_200k_tokens * MILLION
            : undefined,
        cacheCreationInputCostPerMTokens: cacheCreationInputCostPerToken * MILLION,
        cacheCreationInputCostPerMTokensAbove200K: pricing.cache_creation_input_token_cost_above_200k_tokens != null
            ? pricing.cache_creation_input_token_cost_above_200k_tokens * MILLION
            : undefined,
        fastMultiplier: pricing.provider_specific_entry?.fast,
        inputCostPerMTokens: inputCostPerToken * MILLION,
        inputCostPerMTokensAbove200K: pricing.input_cost_per_token_above_200k_tokens != null
            ? pricing.input_cost_per_token_above_200k_tokens * MILLION
            : undefined,
        outputCostPerMTokens: outputCostPerToken * MILLION,
        outputCostPerMTokensAbove200K: pricing.output_cost_per_token_above_200k_tokens != null
            ? pricing.output_cost_per_token_above_200k_tokens * MILLION
            : undefined,
    }
}

/**
 * Creates a pricing shape where every price is zero for free or unpriced models.
 *
 * @example
 * ```ts
 * const freePricing = createZeroPricing()
 * ```
 */
function createZeroPricing(): ModelPricing {
    return {
        cachedInputCostPerMTokens: 0,
        cacheCreationInputCostPerMTokens: 0,
        inputCostPerMTokens: 0,
        outputCostPerMTokens: 0,
    }
}

/**
 * Calculates token cost with optional tiered pricing above the 200K-token threshold.
 *
 * @example
 * ```ts
 * calculateTieredCost(250_000, 1, 2)
 * // 0.3
 * ```
 */
function calculateTieredCost(tokens: number | undefined, baseCostPerMTokens: number, above200KCostPerMTokens?: number) {
    const safeTokens = Math.max(tokens ?? 0, 0)

    if (safeTokens === 0) {
        return 0
    }

    if (safeTokens > 200_000 && above200KCostPerMTokens != null) {
        return (200_000 / MILLION) * baseCostPerMTokens
            + ((safeTokens - 200_000) / MILLION) * above200KCostPerMTokens
    }

    return (safeTokens / MILLION) * baseCostPerMTokens
}

/**
 * Removes empty strings while preserving unique item order.
 *
 * @example
 * ```ts
 * uniqueItems(['gpt-5', '', 'gpt-5'])
 * // ['gpt-5']
 * ```
 */
function uniqueItems(items: string[]) {
    return Array.from(new Set(items.filter(Boolean)))
}
