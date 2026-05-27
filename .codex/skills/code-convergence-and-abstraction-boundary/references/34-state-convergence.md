# State Convergence

## Applicability

Use this reference for repeated pagination, repeated filters, repeated sorting, repeated cache behavior, and repeated async state.

## Best Practices

1. Keep local interaction state inside components.
2. Converge reusable interaction state into composables.
3. Converge cross-page shared state into stores.
4. Converge shareable, refresh-restorable, history-aware state into URL query state.
5. Manage API data, cache, refetch, and invalidation as server state.
6. Use state machines for complex state flows when needed.
7. Use async-state helpers for repeated loading, error, and data patterns.

## Do Not

1. Do not lift all state into stores by default.
2. Do not keep the same state in store, local state, and URL query without boundaries.
3. Do not manually synchronize multiple copies of one source state.
4. Do not store derived state redundantly.

