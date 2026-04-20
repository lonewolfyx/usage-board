import type { ModelPricing } from '#shared/types/platform'

/** Default pricing model used when a Claude Code record has no billable model. */
export const CLAUDE_FALLBACK_MODEL = 'claude-sonnet-4-5'

/** Display and pricing fallback model used when Codex logs do not include a model field. */
export const CODEX_FALLBACK_MODEL = 'gpt-5'

/** Default model used when a Gemini session message does not include a model field. */
export const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash'

/** Maps common Claude aliases to LiteLLM or local pricing table names. */
export const CLAUDE_MODEL_ALIASES: Record<string, string> = {
    'claude-3-5-haiku-latest': 'claude-haiku-4-5',
    'claude-3-5-sonnet-latest': 'claude-sonnet-4-5',
    'claude-3-7-sonnet-latest': 'claude-sonnet-4-5',
    'claude-haiku-4.5': 'claude-haiku-4-5',
    'claude-opus-4.1': 'claude-opus-4-1',
    'claude-sonnet-4.5': 'claude-sonnet-4-5',
    'claude-4-1-opus': 'claude-opus-4-1',
    'claude-4-5-haiku': 'claude-haiku-4-5',
    'claude-4-5-sonnet': 'claude-sonnet-4-5',
}

/** Maps Codex-specific model names to LiteLLM or local pricing table names. */
export const CODEX_MODEL_ALIASES: Record<string, string> = {
    'gpt-5-codex': 'gpt-5',
    'gpt-5.3-codex': 'gpt-5.2-codex',
}

/** Maps Gemini-specific model names to pricing table names. */
export const GEMINI_MODEL_ALIASES: Record<string, string> = {
    'gemini-3-flash-preview': 'gemini-3-flash',
}

/** Gemini fallback prices for primary models when LiteLLM data is missing or unavailable. */
export const GEMINI_FALLBACK_PRICING_TABLE: Record<string, ModelPricing> = {
    'gemini-2.5-flash': {
        cachedInputCostPerMTokens: 0.075,
        cacheCreationInputCostPerMTokens: 0.3,
        inputCostPerMTokens: 0.3,
        outputCostPerMTokens: 2.5,
    },
    'gemini-2.5-flash-lite': {
        cachedInputCostPerMTokens: 0.025,
        cacheCreationInputCostPerMTokens: 0.1,
        inputCostPerMTokens: 0.1,
        outputCostPerMTokens: 0.4,
    },
    'gemini-2.5-pro': {
        cachedInputCostPerMTokens: 0.31,
        cachedInputCostPerMTokensAbove200K: 0.625,
        cacheCreationInputCostPerMTokens: 1.25,
        cacheCreationInputCostPerMTokensAbove200K: 2.5,
        inputCostPerMTokens: 1.25,
        inputCostPerMTokensAbove200K: 2.5,
        outputCostPerMTokens: 10,
        outputCostPerMTokensAbove200K: 15,
    },
    'gemini-3-flash': {
        cachedInputCostPerMTokens: 0.05,
        cacheCreationInputCostPerMTokens: 0.5,
        inputCostPerMTokens: 0.5,
        outputCostPerMTokens: 3,
    },
    'gemini-3-flash-preview': {
        cachedInputCostPerMTokens: 0.05,
        cacheCreationInputCostPerMTokens: 0.5,
        inputCostPerMTokens: 0.5,
        outputCostPerMTokens: 3,
    },
}
