# Duplicate Dependency Capabilities

## Applicability

Use this reference when adding dependencies, replacing dependencies, wrapping third-party libraries, choosing utility libraries, date libraries, request libraries, class-name merge utilities, or implementing standard utility behavior.

## Best Practices

Before adding a dependency, answer:

1. Does an existing dependency already cover this capability?
2. Does the standard library already cover this capability?
3. Does the project already contain an appropriate utility?
4. Will the new dependency increase bundle or install size?
5. Will the new dependency introduce runtime risk?
6. Does the new dependency have credible long-term maintenance?

## Do Not

1. Do not introduce multiple libraries for the same capability.
2. Do not mix utility-library capabilities such as `lodash-es`, `radash`, and `es-toolkit` without boundaries.
3. Do not keep multiple date libraries without distinct responsibilities.
4. Do not keep multiple request libraries without distinct responsibilities.
5. Do not keep multiple class-name merge utilities without distinct responsibilities.
6. Do not add overlapping third-party dependencies.
7. Do not add a dependency before checking existing capabilities.
8. Do not introduce a large dependency for a simple function.
9. Do not wrap capabilities that a third-party library already provides unless the wrapper adds boundary value.
10. Do not mix custom utilities and third-party utilities for the same capability inside the same module.

