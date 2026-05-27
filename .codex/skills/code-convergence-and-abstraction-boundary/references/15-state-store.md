# Duplicate State and Store Logic

## Applicability

Use this reference when stores, pages, modules, or components maintain the same state shape, filters, pagination, sorting, caching, refresh logic, debounce, throttle, polling, retry, optimistic update, derived state, or URL query state.

## Best Practices

1. Keep component-local state inside the component when it affects only that component.
2. Use composable state for reusable interaction logic.
3. Use store state for cross-page or cross-module shared state.
4. Use URL query state when state must be shareable, refresh-restorable, or navigable through browser history.
5. Treat server state as API data plus cache, refetch, and invalidation strategy.
6. Derive computed state through computed values, getters, or selectors instead of storing redundant copies.
7. Provide one shared implementation for debounce, throttle, polling, retry, and optimistic update behavior.

## Do Not

1. Do not duplicate the same state shape across multiple stores.
2. Do not duplicate the same filter state across multiple pages.
3. Do not duplicate the same pagination state across multiple pages.
4. Do not duplicate the same sorting state across multiple pages.
5. Do not duplicate the same cache logic across multiple modules.
6. Do not duplicate the same refresh logic across multiple modules.
7. Do not repeatedly implement debounce, throttle, polling, or retry.
8. Do not repeatedly implement optimistic update.
9. Do not redundantly store derivable state.
10. Do not place the same state in store state, local state, and URL query state without an explicit boundary.
11. Do not manually synchronize multiple copies of the same state.
12. Do not lift temporary UI state into a global store.
13. Do not keep cross-page shared state inside a local component.

