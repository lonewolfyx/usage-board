# Duplicate Components and Composable Logic

## Applicability

Use this reference when component structure, styling, interaction, props, emits, slots, modal logic, table logic, pagination, filtering, forms, composables, hooks, or reusable interaction state is repeated.

## Best Practices

1. Converge repeated UI structure into base components, domain components, renderless components, slots, or variant configs.
2. Converge reusable interaction state into a composable only when it uses reactive state, lifecycle, injection, context, side effects, reusable interaction state, or reusable async state.
3. Converge repeated props, emits, and slots into shared types or a single component boundary.
4. Move repeated modal, table, pagination, filtering, and form logic into a domain component or composable.
5. Use plain function names for pure functions; reserve `useXxx` for composables.

## Do Not

1. Do not keep components that have identical structure, styling, and interaction but different names.
2. Do not repeat identical props declarations across components.
3. Do not repeat identical emits declarations across components.
4. Do not repeat identical slot types across components.
5. Do not duplicate composables or hooks.
6. Do not keep composables with different names but the same state shape, lifecycle behavior, and return value.
7. Do not repeat modal logic across pages.
8. Do not repeat table logic across pages.
9. Do not repeat pagination logic across pages.
10. Do not repeat filtering logic across pages.
11. Do not repeat form logic across pages.
12. Do not scatter reusable interaction logic across multiple components.
13. Do not reimplement generic UI behavior inside domain components.
14. Do not name a plain pure function `useXxx`.

## `useXxx` Naming Requirements

Use `useXxx` only when the function uses at least one of these capabilities:

1. Reactive state.
2. Lifecycle hooks.
3. Dependency injection.
4. Context.
5. Side-effect management.
6. Reusable interaction state.
7. Reusable async state.

