# Type Convergence

## Applicability

Use this reference for repeated interfaces, repeated unions, repeated enums, repeated DTOs, repeated Forms, and repeated Models.

## Best Practices

1. Use one domain type for one business entity.
2. Derive types from `const` values to avoid hand-maintaining runtime and type value domains.
3. Use `Pick`, `Omit`, `Partial`, and `Required` to express structural differences.
4. Use generic parameters to express variable parts.
5. Use branded types to express real constraints.

## Do Not

1. Do not copy identical data structures only for naming layers.
2. Do not wrap primitives in aliases that add no constraint.
3. Do not let DTO, Form, or Model names differ while fields, lifecycle, and validation semantics are identical.
4. Do not hand-maintain runtime constants and union types as separate value domains.

