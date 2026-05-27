# Convergence Triggers

## Applicability

Use this reference when code contains duplicated behavior, near-duplicate implementations, synonymous names, multiple entry points, multiple implementations, multiple maintenance locations, or a rule that requires coordinated edits across files.

## Best Practices

1. Converge logic that appears more than once and is likely to change together.
2. Move repeated business rules into a single semantic owner.
3. Use one shared type when repeated structures have the same meaning.
4. Keep one recommended entry point for each API call, capability, public export, or shared behavior.
5. Converge repeated UI style fragments, error handling, async state handling, field validation, data conversion, and formatting logic.
6. Choose one domain term when the same concept appears under multiple synonyms.
7. Reduce entry points when a new developer cannot tell which function, type, component, config, or import path should be used.
8. Treat renamed code as duplicate when inputs, outputs, behavior, and responsibility are effectively the same.

## Do Not

1. Do not rename, split, or rewrite code only to evade duplicate detection.
2. Do not spread the same business rule across multiple files.
3. Do not keep the same capability under different names in different modules.
4. Do not keep code that has no independent responsibility and only exists to look architectural.

