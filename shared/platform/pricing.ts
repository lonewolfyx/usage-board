import type {
    CreateLiteLLMPricingResolverOptions,
    FetchLiteLLMPricingDatasetOptions,
    LiteLLMModelPricing,
    LiteLLMPricingDataset,
    ModelPricing,
    ModelPricingResolver,
    ResolvedCostSource,
    TokenCostUsage,
} from '#shared/types/platform'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { roundCurrency, uniqueItems } from '#shared/utils/usage-dashboard'

const MILLION = 1_000_000
const DEFAULT_PRICING_FETCH_TIMEOUT_MS = 1500
const DEFAULT_LITELLM_PRICING_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
const DEFAULT_MODELS_DEV_PRICING_URL = 'https://models.dev/api.json'
const LITELLM_PRICING_SNAPSHOT_PATH = fileURLToPath(new URL('./pricing-data/litellm-pricing.json', import.meta.url))
const MODELS_DEV_PRICING_SNAPSHOT_PATH = fileURLToPath(new URL('./pricing-data/models-dev-pricing.json', import.meta.url))
const FAST_MULTIPLIER_OVERRIDES_SNAPSHOT_PATH = fileURLToPath(new URL('./pricing-data/fast-multiplier-overrides.json', import.meta.url))
const MODEL_DATE_SUFFIX_DIGITS = 8

const DEFAULT_FAST_MULTIPLIER_EXACT_OVERRIDES: Record<string, number> = {
    'gpt-5.3-codex': 2,
    'gpt-5.4': 2,
    'gpt-5.5': 2.5,
}

const DEFAULT_FAST_MULTIPLIER_PREFIX_OVERRIDES: Record<string, number> = {
    'claude-opus-4-6': 6,
    'claude-opus-4-7': 6,
    'claude-opus-4-8': 2,
}

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
        fastMultiplier: DEFAULT_FAST_MULTIPLIER_EXACT_OVERRIDES['gpt-5.5'],
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
        fastMultiplier: DEFAULT_FAST_MULTIPLIER_PREFIX_OVERRIDES['claude-opus-4-6'],
        inputCostPerMTokens: 5,
        outputCostPerMTokens: 25,
    },
    'claude-opus-4-7': {
        cachedInputCostPerMTokens: 0.5,
        cacheCreationInputCostPerMTokens: 6.25,
        fastMultiplier: DEFAULT_FAST_MULTIPLIER_PREFIX_OVERRIDES['claude-opus-4-7'],
        inputCostPerMTokens: 5,
        outputCostPerMTokens: 25,
    },
    'claude-opus-4-8': {
        cachedInputCostPerMTokens: 0.5,
        cacheCreationInputCostPerMTokens: 6.25,
        fastMultiplier: DEFAULT_FAST_MULTIPLIER_PREFIX_OVERRIDES['claude-opus-4-8'],
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

interface FastMultiplierOverridesSnapshot {
    exact?: Record<string, number>
    normalized_prefix?: Record<string, number>
}

interface PricingSnapshotState {
    liteLLM: LiteLLMPricingDataset
    modelsDev: LiteLLMPricingDataset
    fastMultiplierOverrides: {
        exact: Record<string, number>
        normalizedPrefix: Record<string, number>
    }
}

let pricingSnapshotPromise: Promise<PricingSnapshotState> | null = null

export function resetRemotePricingCache() {
    pricingSnapshotPromise = null
}

export async function createLiteLLMPricingResolver(options: CreateLiteLLMPricingResolverOptions = {}): Promise<ModelPricingResolver> {
    const datasets = await loadPricingSnapshots(options)
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
        const snapshotPricing = resolveSnapshotPricing(datasets, lookupCandidates, datasets.fastMultiplierOverrides)

        if (snapshotPricing) {
            return snapshotPricing
        }

        const fallbackPricing = resolveFallbackPricing(fallbackPricingTable, lookupCandidates, datasets.fastMultiplierOverrides)

        if (fallbackPricing) {
            return fallbackPricing
        }

        if (fallbackModel) {
            const fallbackCandidates = uniqueItems(expandLookupCandidates(fallbackModel, aliases, getLookupCandidates).filter(Boolean))

            return resolveSnapshotPricing(datasets, fallbackCandidates, datasets.fastMultiplierOverrides)
                ?? resolveFallbackPricing(fallbackPricingTable, fallbackCandidates, datasets.fastMultiplierOverrides)
                ?? createZeroPricing()
        }

        return createZeroPricing()
    }
}

export function calculateUsageCostUSD(
    usage: TokenCostUsage,
    pricing: ModelPricing,
    options: { defaultFastMultiplier?: number, speed?: 'fast' | 'standard' } = {},
) {
    const multiplier = options.speed === 'fast' ? (pricing.fastMultiplier ?? options.defaultFastMultiplier ?? 1) : 1
    const inputCost = calculateTieredCost(usage.inputTokens, pricing.inputCostPerMTokens, pricing.inputCostPerMTokensAbove200K)
    const cachedCost = calculateTieredCost(usage.cachedInputTokens, pricing.cachedInputCostPerMTokens, pricing.cachedInputCostPerMTokensAbove200K)
    const cacheCreationCost = calculateTieredCost(usage.cacheCreationTokens ?? 0, pricing.cacheCreationInputCostPerMTokens, pricing.cacheCreationInputCostPerMTokensAbove200K)
    const outputCost = calculateTieredCost(usage.outputTokens, pricing.outputCostPerMTokens, pricing.outputCostPerMTokensAbove200K)

    return roundCurrency((inputCost + cachedCost + cacheCreationCost + outputCost) * multiplier)
}

export function eventCostUSD(
    event: {
        cacheCreationTokens?: number
        cachedInputTokens: number
        inputTokens: number
        model: string
        modelLookupCandidates?: string[] | null
        outputTokens: number
        rawCostUSD?: number | null
        reasoningOutputTokens: number
        speed?: 'fast' | 'standard' | null
        toolTokens?: number
    },
    resolvePricing: ModelPricingResolver,
    options: { defaultFastMultiplier?: number } = {},
) {
    return resolveUsageCostFromCandidates({
        cacheCreationTokens: event.cacheCreationTokens ?? 0,
        cachedInputTokens: event.cachedInputTokens,
        inputTokens: event.inputTokens,
        model: event.model,
        modelLookupCandidates: event.modelLookupCandidates ?? undefined,
        outputTokens: event.outputTokens + event.reasoningOutputTokens + (event.toolTokens ?? 0),
        rawCostUSD: event.rawCostUSD ?? null,
        speed: event.speed ?? undefined,
    }, resolvePricing, options).costUSD
}

export function resolveUsageCostFromCandidates(
    input: {
        cacheCreationTokens?: number
        cachedInputTokens: number
        inputTokens: number
        model: string | null
        modelLookupCandidates?: string[]
        outputTokens: number
        rawCostUSD?: number | null
        speed?: 'fast' | 'standard'
    },
    resolvePricing: ModelPricingResolver,
    options: { defaultFastMultiplier?: number } = {},
): { costSource: ResolvedCostSource, costUSD: number } {
    if (input.rawCostUSD != null && Number.isFinite(input.rawCostUSD)) {
        return {
            costSource: 'raw',
            costUSD: roundCurrency(input.rawCostUSD),
        }
    }

    const candidates = uniqueItems(
        [
            ...(input.modelLookupCandidates ?? []),
            input.model ?? '',
        ].map(candidate => candidate.trim()).filter(Boolean),
    )

    if (!input.model || candidates.length === 0) {
        return {
            costSource: 'none',
            costUSD: 0,
        }
    }

    for (const candidate of candidates) {
        const costUSD = calculateUsageCostUSD({
            cacheCreationTokens: input.cacheCreationTokens ?? 0,
            cachedInputTokens: input.cachedInputTokens,
            inputTokens: input.inputTokens,
            outputTokens: input.outputTokens,
        }, resolvePricing(candidate), {
            defaultFastMultiplier: options.defaultFastMultiplier,
            speed: input.speed,
        })

        if (costUSD > 0) {
            return {
                costSource: 'calculated',
                costUSD,
            }
        }
    }

    return {
        costSource: 'none',
        costUSD: 0,
    }
}

async function loadPricingSnapshots(options: FetchLiteLLMPricingDatasetOptions = {}) {
    if (!options.forceRefresh && pricingSnapshotPromise) {
        return pricingSnapshotPromise
    }

    pricingSnapshotPromise = (async () => {
        const liteLLMLocal = await readPricingSnapshot(LITELLM_PRICING_SNAPSHOT_PATH, createFallbackLiteLLMPricingDataset())
        const modelsDevLocal = await readObjectSnapshot(MODELS_DEV_PRICING_SNAPSHOT_PATH, {})
        const fastMultiplierOverrides = await readFastMultiplierOverridesSnapshot()
        const fetcher = options.fetcher ?? globalThis.fetch

        if (typeof fetcher !== 'function') {
            return {
                liteLLM: liteLLMLocal,
                modelsDev: createModelsDevPricingDataset(modelsDevLocal),
                fastMultiplierOverrides,
            }
        }

        const [liteLLMRemote, modelsDevRemote] = await Promise.all([
            fetchLiteLLMPricingDataset(fetcher),
            fetchModelsDevPricingSnapshot(fetcher),
        ])
        const liteLLM = mergeMissingPricing(liteLLMLocal, liteLLMRemote)
        const modelsDev = mergeMissingModelsDevSnapshots(modelsDevLocal, modelsDevRemote)

        await Promise.all([
            liteLLM.changed ? writePricingSnapshot(LITELLM_PRICING_SNAPSHOT_PATH, liteLLM.dataset) : Promise.resolve(),
            modelsDev.changed ? writePricingSnapshot(MODELS_DEV_PRICING_SNAPSHOT_PATH, modelsDev.dataset) : Promise.resolve(),
        ])

        return {
            liteLLM: liteLLM.dataset,
            modelsDev: createModelsDevPricingDataset(modelsDev.dataset),
            fastMultiplierOverrides,
        }
    })()

    return pricingSnapshotPromise
}

async function readPricingSnapshot(path: string, fallback: LiteLLMPricingDataset) {
    try {
        const content = await readFile(path, 'utf8')
        const parsed = JSON.parse(content)

        if (isLiteLLMPricingDataset(parsed)) {
            return parsed
        }
    }
    catch {
    }

    return fallback
}

async function readObjectSnapshot(path: string, fallback: Record<string, unknown>) {
    try {
        const content = await readFile(path, 'utf8')
        const parsed = JSON.parse(content)

        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>
        }
    }
    catch {
    }

    return fallback
}

async function readFastMultiplierOverridesSnapshot() {
    const snapshot = await readObjectSnapshot(FAST_MULTIPLIER_OVERRIDES_SNAPSHOT_PATH, {
        exact: DEFAULT_FAST_MULTIPLIER_EXACT_OVERRIDES,
        normalized_prefix: DEFAULT_FAST_MULTIPLIER_PREFIX_OVERRIDES,
    })

    const value = snapshot as FastMultiplierOverridesSnapshot

    return {
        exact: value.exact ?? DEFAULT_FAST_MULTIPLIER_EXACT_OVERRIDES,
        normalizedPrefix: value.normalized_prefix ?? DEFAULT_FAST_MULTIPLIER_PREFIX_OVERRIDES,
    }
}

async function writePricingSnapshot(path: string, dataset: Record<string, unknown>) {
    await mkdir(dirname(path), {
        recursive: true,
    })
    await writeFile(path, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8')
}

async function fetchLiteLLMPricingDataset(fetcher: typeof fetch): Promise<LiteLLMPricingDataset> {
    try {
        const response = await fetchPricingDatasetResponse(fetcher, DEFAULT_LITELLM_PRICING_URL)

        if (!response.ok) {
            return {}
        }

        const data = await response.json()
        return isLiteLLMPricingDataset(data) ? data : {}
    }
    catch {
        return {}
    }
}

async function fetchModelsDevPricingSnapshot(fetcher: typeof fetch): Promise<Record<string, unknown>> {
    try {
        const response = await fetchPricingDatasetResponse(fetcher, DEFAULT_MODELS_DEV_PRICING_URL)

        if (!response.ok) {
            return {}
        }

        const data = await response.json()
        return data && typeof data === 'object' && !Array.isArray(data)
            ? data as Record<string, unknown>
            : {}
    }
    catch {
        return {}
    }
}

function fetchPricingDatasetResponse(fetcher: typeof fetch, url: string) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        return fetcher(url, {
            signal: AbortSignal.timeout(DEFAULT_PRICING_FETCH_TIMEOUT_MS),
        })
    }

    return fetcher(url)
}

function mergeMissingPricing(localDataset: LiteLLMPricingDataset, remoteDataset: LiteLLMPricingDataset) {
    const nextDataset: LiteLLMPricingDataset = { ...localDataset }
    let changed = false

    for (const [model, pricing] of Object.entries(remoteDataset)) {
        if (nextDataset[model] || !hasNonZeroTokenPricing(pricing)) {
            continue
        }

        nextDataset[model] = pricing
        changed = true
    }

    return {
        changed,
        dataset: nextDataset,
    }
}

function mergeMissingModelsDevSnapshots(localSnapshot: Record<string, unknown>, remoteSnapshot: Record<string, unknown>) {
    const nextSnapshot: Record<string, unknown> = { ...localSnapshot }
    let changed = false

    for (const [providerName, providerValue] of Object.entries(remoteSnapshot)) {
        const remoteProvider = providerValue as ModelsDevProviderRecord
        const remoteModels = remoteProvider?.models

        if (!remoteModels || typeof remoteModels !== 'object') {
            continue
        }

        const localProvider = nextSnapshot[providerName]
        const localProviderRecord = localProvider && typeof localProvider === 'object' && !Array.isArray(localProvider)
            ? localProvider as ModelsDevProviderRecord
            : { models: {} }
        const localModels = localProviderRecord.models && typeof localProviderRecord.models === 'object'
            ? { ...localProviderRecord.models }
            : {}
        let providerChanged = false

        for (const [modelName, modelRecord] of Object.entries(remoteModels)) {
            if (localModels[modelName]) {
                continue
            }

            localModels[modelName] = modelRecord
            providerChanged = true
            changed = true
        }

        if (providerChanged) {
            nextSnapshot[providerName] = {
                ...(localProviderRecord as Record<string, unknown>),
                models: localModels,
            }
        }
        else if (!(providerName in nextSnapshot)) {
            nextSnapshot[providerName] = providerValue
            changed = true
        }
    }

    return {
        changed,
        dataset: nextSnapshot,
    }
}

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

function isLiteLLMPricingDataset(value: unknown): value is LiteLLMPricingDataset {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function defaultLookupCandidates(model: string) {
    const normalizedModel = model.trim()

    return [
        normalizedModel,
        normalizedModel.replace(/^openai\//u, ''),
        normalizedModel.replace(/^azure\//u, ''),
        normalizedModel.replace(/^anthropic\//u, ''),
        normalizedModel.replace(/^google\//u, ''),
        normalizedModel.replace(/^vertex_ai\//u, ''),
        normalizedModel.replace(/^moonshot\//u, ''),
        normalizedModel.replace(/^qwen\//u, ''),
        normalizedModel.replace(/^alibaba\//u, ''),
        normalizedModel.replace(/^openrouter\//u, ''),
        normalizedModel.replace(/^openrouter\/openai\//u, ''),
        normalizedModel.replace(/^openrouter\/anthropic\//u, ''),
        normalizedModel.replace(/^openrouter\/google\//u, ''),
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

function resolveSnapshotPricing(
    datasets: PricingSnapshotState,
    candidates: string[],
    fastMultiplierOverrides: PricingSnapshotState['fastMultiplierOverrides'],
) {
    return resolveDatasetPricing(datasets.liteLLM, candidates, fastMultiplierOverrides)
        ?? resolveDatasetPricing(datasets.modelsDev, candidates, fastMultiplierOverrides)
}

function resolveDatasetPricing(
    dataset: LiteLLMPricingDataset,
    candidates: string[],
    fastMultiplierOverrides: PricingSnapshotState['fastMultiplierOverrides'],
) {
    for (const candidate of candidates) {
        const pricing = dataset[candidate]

        if (!pricing || !hasNonZeroTokenPricing(pricing)) {
            continue
        }

        return toModelPricing(pricing, candidates, fastMultiplierOverrides)
    }

    const bestMatch = Object.entries(dataset)
        .filter(([model]) => candidates.some(candidate => pricingKeyMatches(model, candidate)))
        .sort(([left], [right]) => right.length - left.length || left.localeCompare(right))[0]

    return bestMatch ? toModelPricing(bestMatch[1], candidates, fastMultiplierOverrides) : null
}

function resolveFallbackPricing(
    fallbackPricingTable: Record<string, ModelPricing>,
    candidates: string[],
    fastMultiplierOverrides: PricingSnapshotState['fastMultiplierOverrides'],
) {
    for (const candidate of candidates) {
        const pricing = fallbackPricingTable[candidate]

        if (pricing) {
            const fastMultiplier = pricing.fastMultiplier ?? resolveFastMultiplierOverride(fastMultiplierOverrides, candidates)

            return fastMultiplier == null
                ? pricing
                : { ...pricing, fastMultiplier }
        }
    }

    return null
}

function hasNonZeroTokenPricing(pricing: LiteLLMModelPricing) {
    return (pricing.input_cost_per_token ?? 0) > 0
        || (pricing.output_cost_per_token ?? 0) > 0
        || (pricing.cache_creation_input_token_cost ?? 0) > 0
        || (pricing.cache_read_input_token_cost ?? 0) > 0
}

function toModelPricing(
    pricing: LiteLLMModelPricing,
    candidates: string[],
    fastMultiplierOverrides: PricingSnapshotState['fastMultiplierOverrides'],
): ModelPricing {
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
        fastMultiplier: pricing.provider_specific_entry?.fast ?? resolveFastMultiplierOverride(fastMultiplierOverrides, candidates),
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

function resolveFastMultiplierOverride(
    snapshot: {
        exact: Record<string, number>
        normalizedPrefix: Record<string, number>
    },
    candidates: string[],
) {
    for (const candidate of candidates) {
        const multiplier = snapshot.exact[candidate]

        if (multiplier != null) {
            return multiplier
        }
    }

    for (const candidate of candidates) {
        const normalized = candidate.replace(/[.@]/gu, '-')

        for (const part of normalized.split(/[/:]/u)) {
            for (const [base, multiplier] of Object.entries(snapshot.normalizedPrefix)) {
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

function pricingKeyMatches(candidate: string, model: string) {
    const normalizedModel = normalizedPricingKey(model)
    return containsPricingKey(model, candidate)
        || containsPricingKey(candidate, model)
        || containsPricingKey(normalizedModel, normalizedPricingKey(candidate))
        || containsPricingKey(normalizedPricingKey(candidate), normalizedModel)
}

function containsPricingKey(value: string, key: string) {
    let index = value.indexOf(key)

    while (index >= 0) {
        const before = index > 0 ? value.charCodeAt(index - 1) : null
        const suffix = value.slice(index + key.length)

        if ((before == null || isPricingKeyBoundary(before))
            && suffixAllowsPricingKeyMatch(key, suffix)) {
            return true
        }

        index = value.indexOf(key, index + 1)
    }

    return false
}

function isPricingKeyBoundary(charCode: number) {
    const char = String.fromCharCode(charCode)
    return !/[a-zA-Z0-9]/u.test(char)
}

function suffixAllowsPricingKeyMatch(key: string, suffix: string) {
    if (suffix.length === 0) {
        return true
    }

    const separator = suffix.charCodeAt(0)

    if (!isPricingKeyBoundary(separator)) {
        return false
    }

    return !suffixStartsWithNumericModelVersion(key, suffix)
}

function suffixStartsWithNumericModelVersion(key: string, suffix: string) {
    if (!/\d$/u.test(key) || !/^[.-]/u.test(suffix)) {
        return false
    }

    const rest = suffix.slice(1)
    const match = /^\d+/u.exec(rest)

    if (!match) {
        return false
    }

    const digitLength = match[0].length
    const afterDigits = rest[digitLength] ?? null

    return !(digitLength === MODEL_DATE_SUFFIX_DIGITS && (afterDigits == null || !/[a-zA-Z0-9]/u.test(afterDigits)))
}

function normalizedPricingKey(value: string) {
    return value.replace(/[.@]/gu, '-')
}

function createZeroPricing(): ModelPricing {
    return {
        cachedInputCostPerMTokens: 0,
        cacheCreationInputCostPerMTokens: 0,
        inputCostPerMTokens: 0,
        outputCostPerMTokens: 0,
    }
}

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
