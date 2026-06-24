/** Display and pricing fallback model used when Codex logs do not include a model field. */
export const CODEX_FALLBACK_MODEL = 'gpt-5'

/** Default model used when a Gemini session message does not include a model field. */
export const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash'

/** Maps Codex-specific model names to LiteLLM or local pricing table names. */
export const CODEX_MODEL_ALIASES: Record<string, string> = {
    'gpt-5-codex': 'gpt-5',
    'gpt-5.3-codex': 'gpt-5.2-codex',
}
