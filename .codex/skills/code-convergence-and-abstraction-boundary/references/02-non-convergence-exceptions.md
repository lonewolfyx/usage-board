# Non-Convergence Exceptions

## Applicability

Use this reference when repetition is local, semantics differ, future change directions differ, abstraction would increase complexity, code is still exploratory, or framework constraints require repeated declarations.

## Best Practices

1. Leave repetition local when it appears once or only inside a narrow scope.
2. Keep similar code separate when business semantics or expected change directions differ.
3. Avoid abstraction when it would increase cognitive load, introduce excessive parameters, or make call sites harder to use.
4. Allow explicit repetition in tests when it clarifies distinct business scenarios.
5. Keep low-level utilities and high-level business logic separated when forced reuse would blur boundaries.
6. Accept repeated declarations required by framework conventions when there is no safe convergence path.

## Do Not

1. Do not use local-repetition exceptions to justify stable, hidden, cross-boundary, or missed-update-prone duplication.
2. Do not keep repetition that makes future rule changes easy to miss.
3. Do not confuse different naming with different domain semantics.
4. Do not use exceptions to hide fake abstractions, thin wrappers, or concept drift.

