# Component Convergence

## Applicability

Use this reference for repeated UI structure, repeated interactions, repeated props or emits, and repeated variants.

## Best Practices

1. Converge foundational UI capabilities into base components.
2. Converge stable domain semantics into domain components.
3. Use renderless components or composables when behavior is shared but presentation is not.
4. Use slots when callers need to compose external content.
5. Use variant configuration for size, variant, color, and similar visual differences.

## Do Not

1. Do not force components with different semantics into one component only because they look similar.
2. Do not let variant parameters grow without boundaries.
3. Do not sacrifice call-site readability for reuse.
4. Do not name plain pure functions `useXxx`.

