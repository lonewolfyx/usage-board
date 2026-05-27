# Goals and Principles

## Applicability

Use this reference before implementing, refactoring, cleaning up, reviewing, extracting shared capabilities, removing duplicate implementations, adjusting module boundaries, changing type definitions, or changing API entry points in this repository.

## Best Practices

1. Treat code convergence as a way to unify business rules, isolate real variation points, reduce maintenance cost, improve type consistency, reduce missed-update risk, lower onboarding cost, and keep one trusted entry point for each capability.
2. Require every abstraction to provide at least one concrete benefit: unified semantics, unified types, unified behavior, a stable entry point, isolated variation, lower change cost, lower test cost, or lower caller cognitive load.
3. Allow small local repetition when it is cheaper and clearer, but converge stable repetition that crosses modules, pages, workflows, or ownership boundaries.
4. Keep abstractions easier to understand, modify, and test than the duplicated code they replace.
5. When abstraction value cannot be proven, keep the implementation local and direct instead of creating formal reuse.

## Do Not

1. Do not treat line-count reduction as the goal of convergence.
2. Do not create layers, functions, types, components, or directories only to make the code look architectural.
3. Do not allow one capability to have multiple trusted entry points.
4. Do not keep an abstraction if it makes the system harder to understand, harder to change, or harder to test.

