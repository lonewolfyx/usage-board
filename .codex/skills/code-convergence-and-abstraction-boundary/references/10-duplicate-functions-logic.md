# Duplicate Functions and Logic

## Applicability

Use this reference when functions, inline callbacks, conditionals, state checks, data processing, data conversion, formatting, validation, error handling, async state handling, fallback logic, or business rules are repeated.

## Best Practices

1. Converge stable repeated decisions, conversions, validations, formatting, and error handling into pure functions, strategy maps, validators, formatters, normalizers, parsers, or mappers.
2. Give each business rule one trusted entry point; do not reimplement the same decision in components, composables, services, and stores.
3. Put fallback behavior near the data boundary or a shared normalizer instead of scattering expressions such as `list ?? []` or `total ?? 0` through UI code.
4. Extract repeated `map`, `filter`, or `reduce` pipelines only when the extracted function has clear domain semantics.
5. Name extracted logic by business responsibility and keep inputs, outputs, and error semantics stable.

## Do Not

1. Do not duplicate inline callbacks.
2. Do not keep functions with different names but the same logic.
3. Do not keep functions that differ only by parameter names while behavior stays the same.
4. Do not duplicate business logic.
5. Do not duplicate conditional branches.
6. Do not duplicate state-checking logic.
7. Do not duplicate `map`, `filter`, or `reduce` data-processing logic.
8. Do not duplicate data conversion logic such as DTO to ViewModel or API response to form data.
9. Do not duplicate formatting logic for dates, money, file sizes, percentages, units, or similar display values.
10. Do not duplicate field validation logic.
11. Do not duplicate error handling logic.
12. Do not duplicate loading, error, or data async-state logic.
13. Do not scatter repeated fallback logic through page-level code.
14. Do not implement the same business rule in multiple places.
15. Do not keep the same decision logic in component, composable, service, and store layers at the same time.
16. Do not allow small repeated implementations of the same logic to accumulate in multiple files.
17. Do not rename, split, or rewrite code only to avoid being recognized as duplicate logic.

