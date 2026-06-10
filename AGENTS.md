# Agent Rules

This repository treats invalid helper extraction as a hard prohibition, not a style preference.

## Prohibited by Default

- Do not add wrapper functions that only rename one expression.
- Do not wrap `basename`, `dirname`, `join`, regex `test`, `typeof`, `Number.isFinite`, `Math.trunc`, `trim`, `split`, `pop`, or `toISOString` unless the wrapper owns a real shared business rule.
- Do not add single-call-site helpers just to make code “look cleaner”.
- Do not add `toNumber`, `toOptionalNumber`, `timestampFromX`, `isX`, `getXPath`, `getSessionId`, `getTraceId`, `getAttributeString`, or similar helpers when the body is only a direct expression.
- Do not build helper chains where one helper only calls another helper with the same responsibility.

## Required Decision Rule

Before adding any new helper function, all of the following must be true:

1. It unifies a real business rule, stable boundary, or repeated cross-module behavior.
2. It is clearer than the inline expression at every call site that uses it.
3. Inlining it would materially increase maintenance risk, misuse risk, or duplication.

If any of those are false, inline the logic instead of extracting a helper.

## Anti-Examples

These patterns are banned unless they become true multi-call-site domain rules:

```ts
function toNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

function toOptionalNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function timestampFromHermesValue(value: unknown) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return null
    }

    const date = fromDateTimestamp(value)
    return date ? date.toISOString() : null
}

function getCopilotAttributeString(attributes: Record<string, unknown>, key: string) {
    return normalizeStringValue(attributes[key])
}

function getCodexConfigPath(codexPath: string) {
    return join(codexPath, 'config.toml')
}
```
