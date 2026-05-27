# Duplicate Styles and UI Variants

## Applicability

Use this reference when Tailwind classes, button styles, card styles, input styles, badge styles, hover/active/disabled/error/success states, size rules, variant rules, color rules, dark mode, responsive layout, or base UI capabilities are repeated.

## Best Practices

1. Converge repeated styles into base components, variant configuration, design tokens, class helpers, Tailwind utilities, CSS variables, or theme presets.
2. Keep one class combination or variant source for each visual semantic.
3. Do not reimplement base UI capabilities inside domain components.
4. Promote values that represent design semantics into design tokens.
5. Centralize dark-mode and responsive-layout patterns at the component, variant, or token boundary.

## Do Not

1. Do not duplicate large Tailwind class blocks.
2. Do not repeatedly maintain button, card, input, badge, or other base-component styles.
3. Do not repeatedly maintain hover, active, disabled, error, or success styles.
4. Do not let multiple components define their own size, variant, or color systems.
5. Do not scatter design-token-worthy values through domain components.
6. Do not duplicate class-composition logic.
7. Do not duplicate dark-mode styling logic.
8. Do not duplicate responsive-layout fragments.
9. Do not keep multiple implementations of the same visual pattern.
10. Do not keep multiple class combinations for the same UI semantic.
11. Do not scatter base UI capabilities through domain components.

