import type {
    CreateLiteLLMPricingResolverOptions,
    FetchLiteLLMPricingDatasetOptions,
    LiteLLMModelPricing,
    LiteLLMPricingDataset,
    ModelPricing,
    ModelPricingResolver,
    TokenCostUsage,
} from '#shared/types/platform'
import { uniqueItems } from '#shared/utils/usage-dashboard'

/** Multiplier used to convert per-token prices into per-million-token prices. */
const MILLION = 1_000_000

/** Default in-memory cache duration for LiteLLM pricing data, in milliseconds. */
const DEFAULT_PRICING_CACHE_TTL_MS = 1000 * 60 * 5

/** Official LiteLLM model pricing URL; local fallback prices are used when the request fails. */
const DEFAULT_LITELLM_PRICING_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

/** Secondary pricing source used to fill models that LiteLLM does not currently expose. */
const DEFAULT_MODELS_DEV_PRICING_URL = 'https://models.dev/api.json'

interface PricingCacheEntry {
    fetchedAt: number
    promise?: Promise<LiteLLMPricingDataset>
    value?: LiteLLMPricingDataset
}

interface ModelsDevPricingCacheEntry {
    fetchedAt: number
    promise?: Promise<LiteLLMPricingDataset>
    value?: LiteLLMPricingDataset
}

interface ModelsDevModelCost {
    cache_read?: number
    cache_write?: number
    input?: number
    output?: number
}

interface ModelsDevModelRecord {
    cost?: ModelsDevModelCost
    id?: string
}

interface ModelsDevProviderRecord {
    models?: Record<string, ModelsDevModelRecord>
}

const FAST_MULTIPLIER_EXACT_OVERRIDES: Record<string, number> = {
    'gpt-5.3-codex': 2,
    'gpt-5.4': 2,
    'gpt-5.5': 2.5,
}

const FAST_MULTIPLIER_PREFIX_OVERRIDES: Record<string, number> = {
    'claude-opus-4-6': 6,
    'claude-opus-4-7': 6,
    'claude-opus-4-8': 2,
}

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
    'gpt-5.5': {
        cachedInputCostPerMTokens: 0.5,
        cacheCreationInputCostPerMTokens: 5,
        fastMultiplier: FAST_MULTIPLIER_EXACT_OVERRIDES['gpt-5.5'],
        inputCostPerMTokens: 5,
        outputCostPerMTokens: 30,
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
    'claude-opus-4-6': {
        cachedInputCostPerMTokens: 0.5,
        cacheCreationInputCostPerMTokens: 6.25,
        fastMultiplier: FAST_MULTIPLIER_PREFIX_OVERRIDES['claude-opus-4-6'],
        inputCostPerMTokens: 5,
        outputCostPerMTokens: 25,
    },
    'claude-opus-4-7': {
        cachedInputCostPerMTokens: 0.5,
        cacheCreationInputCostPerMTokens: 6.25,
        fastMultiplier: FAST_MULTIPLIER_PREFIX_OVERRIDES['claude-opus-4-7'],
        inputCostPerMTokens: 5,
        outputCostPerMTokens: 25,
    },
    'claude-opus-4-8': {
        cachedInputCostPerMTokens: 0.5,
        cacheCreationInputCostPerMTokens: 6.25,
        fastMultiplier: FAST_MULTIPLIER_PREFIX_OVERRIDES['claude-opus-4-8'],
        inputCostPerMTokens: 5,
        outputCostPerMTokens: 25,
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

/** Caches the fetched dataset and in-flight request to avoid duplicate network calls. */
let pricingCache: PricingCacheEntry | undefined
let modelsDevPricingCache: ModelsDevPricingCacheEntry | undefined

/**
 * Fetches the LiteLLM model pricing dataset and falls back to the built-in dataset on failure.
 *
 * @example
 * ```ts
 * const dataset = await fetchLiteLLMPricingDataset()
 * console.log(dataset['gpt-5']?.input_cost_per_token)
 * ```
 */
async function fetchLiteLLMPricingDataset(options: FetchLiteLLMPricingDatasetOptions = {}): Promise<LiteLLMPricingDataset> {
    const now = Date.now()
    const cacheEntry = pricingCache

    if (!options.forceRefresh && cacheEntry?.value && now - cacheEntry.fetchedAt < DEFAULT_PRICING_CACHE_TTL_MS) {
        return cacheEntry.value
    }

    if (!options.forceRefresh && cacheEntry?.promise) {
        return cacheEntry.promise
    }

    const fetcher = options.fetcher ?? globalThis.fetch

    if (typeof fetcher !== 'function') {
        return createFallbackLiteLLMPricingDataset()
    }

    const promise = fetcher(DEFAULT_LITELLM_PRICING_URL)
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

            pricingCache = {
                fetchedAt: Date.now(),
                value: dataset,
            }

            return dataset
        })
        .catch(() => {
            const fallback = createFallbackLiteLLMPricingDataset()
            pricingCache = {
                fetchedAt: Date.now(),
                value: fallback,
            }

            return fallback
        })

    pricingCache = {
        fetchedAt: cacheEntry?.fetchedAt ?? 0,
        promise,
        value: cacheEntry?.value,
    }

    return promise
}

async function fetchModelsDevPricingDataset(options: FetchLiteLLMPricingDatasetOptions = {}): Promise<LiteLLMPricingDataset> {
    const now = Date.now()
    const cacheEntry = modelsDevPricingCache

    if (!options.forceRefresh && cacheEntry?.value && now - cacheEntry.fetchedAt < DEFAULT_PRICING_CACHE_TTL_MS) {
        return cacheEntry.value
    }

    if (!options.forceRefresh && cacheEntry?.promise) {
        return cacheEntry.promise
    }

    const fetcher = options.fetcher ?? globalThis.fetch

    if (typeof fetcher !== 'function') {
        return {}
    }

    const promise = fetcher(DEFAULT_MODELS_DEV_PRICING_URL)
        .then(async (response) => {
            if (!response.ok) {
                throw new Error(`Failed to fetch models.dev pricing dataset: ${response.status} ${response.statusText}`)
            }

            const data = await response.json()
            const dataset = createModelsDevPricingDataset(data)

            modelsDevPricingCache = {
                fetchedAt: Date.now(),
                value: dataset,
            }

            return dataset
        })
        .catch(() => {
            const fallback = cacheEntry?.value ?? {}
            modelsDevPricingCache = {
                fetchedAt: Date.now(),
                value: fallback,
            }

            return fallback
        })

    modelsDevPricingCache = {
        fetchedAt: cacheEntry?.fetchedAt ?? 0,
        promise,
        value: cacheEntry?.value,
    }

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
    const [liteLLMDataset, modelsDevDataset] = await Promise.all([
        fetchLiteLLMPricingDataset(options),
        fetchModelsDevPricingDataset(options),
    ])
    const dataset = {
        ...modelsDevDataset,
        ...liteLLMDataset,
    }
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

        const lookupCandidates = uniqueItems(expandLookupCandidates(model, aliases, getLookupCandidates).filter(Boolean))
        const datasetPricing = resolveDatasetPricing(dataset, lookupCandidates)

        if (datasetPricing) {
            return datasetPricing
        }

        const fallbackPricing = resolveFallbackPricing(fallbackPricingTable, lookupCandidates)

        if (fallbackPricing) {
            return fallbackPricing
        }

        if (fallbackModel) {
            const fallbackCandidates = uniqueItems(expandLookupCandidates(fallbackModel, aliases, getLookupCandidates).filter(Boolean))

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
export function calculateUsageCostUSD(usage: TokenCostUsage, pricing: ModelPricing, options: { defaultFastMultiplier?: number, speed?: 'fast' | 'standard' } = {}): number {
    const multiplier = options.speed === 'fast' ? (pricing.fastMultiplier ?? options.defaultFastMultiplier ?? 1) : 1
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
        'gpt-5.5': {
            input_cost_per_token: 5e-6,
            output_cost_per_token: 30e-6,
            cache_creation_input_token_cost: 5e-6,
            cache_read_input_token_cost: 0.5e-6,
            provider_specific_entry: {
                fast: 2.5,
            },
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
        'claude-opus-4-6': {
            input_cost_per_token: 5e-6,
            output_cost_per_token: 25e-6,
            cache_creation_input_token_cost: 6.25e-6,
            cache_read_input_token_cost: 0.5e-6,
            provider_specific_entry: {
                fast: 6,
            },
        },
        'claude-opus-4-7': {
            input_cost_per_token: 5e-6,
            output_cost_per_token: 25e-6,
            cache_creation_input_token_cost: 6.25e-6,
            cache_read_input_token_cost: 0.5e-6,
            provider_specific_entry: {
                fast: 6,
            },
        },
        'claude-opus-4-8': {
            input_cost_per_token: 5e-6,
            output_cost_per_token: 25e-6,
            cache_creation_input_token_cost: 6.25e-6,
            cache_read_input_token_cost: 0.5e-6,
            provider_specific_entry: {
                fast: 2,
            },
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

function createModelsDevPricingDataset(value: unknown): LiteLLMPricingDataset {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {}
    }

    const dataset: LiteLLMPricingDataset = {}

    for (const provider of Object.values(value as Record<string, unknown>)) {
        const models = (provider as ModelsDevProviderRecord)?.models

        if (!models || typeof models !== 'object') {
            continue
        }

        for (const [modelKey, modelRecord] of Object.entries(models)) {
            const modelCost = modelRecord?.cost
            const inputCostPerMToken = modelCost?.input
            const outputCostPerMToken = modelCost?.output

            if (inputCostPerMToken == null || outputCostPerMToken == null) {
                continue
            }

            const modelId = (modelRecord?.id || modelKey).trim()

            if (!modelId || dataset[modelId]) {
                continue
            }

            dataset[modelId] = {
                cache_creation_input_token_cost: (modelCost?.cache_write ?? inputCostPerMToken * 1.25) / MILLION,
                cache_read_input_token_cost: (modelCost?.cache_read ?? inputCostPerMToken * 0.1) / MILLION,
                input_cost_per_token: inputCostPerMToken / MILLION,
                output_cost_per_token: outputCostPerMToken / MILLION,
            }
        }
    }

    return dataset
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

        return toModelPricing(pricing, candidates)
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
            const fastMultiplier = pricing.fastMultiplier ?? resolveFastMultiplierOverride(candidates)

            return fastMultiplier == null
                ? pricing
                : { ...pricing, fastMultiplier }
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
function toModelPricing(pricing: LiteLLMModelPricing, candidates: string[]): ModelPricing {
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
        fastMultiplier: pricing.provider_specific_entry?.fast ?? resolveFastMultiplierOverride(candidates),
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

function resolveFastMultiplierOverride(candidates: string[]): number | undefined {
    for (const candidate of candidates) {
        const multiplier = FAST_MULTIPLIER_EXACT_OVERRIDES[candidate]

        if (multiplier != null) {
            return multiplier
        }
    }

    for (const candidate of candidates) {
        const normalized = candidate.replace(/[.@]/gu, '-')

        for (const part of normalized.split(/[/:]/u)) {
            for (const [base, multiplier] of Object.entries(FAST_MULTIPLIER_PREFIX_OVERRIDES)) {
                if (matchesModelSuffix(part, base)) {
                    return multiplier
                }
            }
        }
    }

    return undefined
}

function matchesModelSuffix(part: string, base: string) {
    const index = part.lastIndexOf(base)

    if (index < 0) {
        return false
    }

    const suffix = part.slice(index)

    return suffix === base || suffix[base.length] === '-'
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
