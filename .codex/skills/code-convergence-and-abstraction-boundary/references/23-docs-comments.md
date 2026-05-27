# Duplicate Documentation and Comments

## Applicability

Use this reference when adding or changing comments, README files, documentation, API descriptions, usage examples, TODOs, FIXMEs, or rule descriptions.

## Best Practices

Use comments to explain:

1. Business reasons.
2. Boundary constraints.
3. Compatibility issues.
4. Performance tradeoffs.
5. Removal conditions for temporary solutions.

Keep documentation and comments tied to one source of truth. Avoid copying API descriptions and examples into multiple locations.

## Do Not

1. Do not add explanatory comments when the code already communicates the same information clearly.
2. Do not add comments that merely restate what the code does.
3. Do not maintain the same API description in multiple documents.
4. Do not let README, docs, and comments contradict each other.
5. Do not copy-paste documentation and change only the title.
6. Do not leave comments that describe behavior the code no longer has.
7. Do not maintain the same usage example in multiple places.
8. Do not keep legacy comments with no maintenance value.
9. Do not write comments that explain only what the code does instead of why it exists.
10. Do not keep stale TODO or FIXME comments without an owner or removal condition.

