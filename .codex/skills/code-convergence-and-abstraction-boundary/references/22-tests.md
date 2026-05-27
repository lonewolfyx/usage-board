# Duplicate and Meaningless Tests

## Applicability

Use this reference when adding or changing test cases, test helpers, fixtures, mocks, coverage-driven tests, regression tests, or boundary tests.

## Best Practices

Cover behavior through:

1. Normal paths.
2. Boundary values.
3. Empty values.
4. Exceptional values.
5. Permission differences.
6. State transitions.
7. Error handling.
8. Data conversion.
9. Business rules.
10. Regression scenarios.

Organize tests around observable behavior. Keep test data, helpers, and fixtures simple enough that they do not obscure the unit under test.

## Do Not

1. Do not duplicate tests with equivalent inputs, outputs, and assertions.
2. Do not keep differently named test cases with identical assertions.
3. Do not test a wrapper that contains no logic.
4. Do not test only mocked results instead of real behavior.
5. Do not cover the same simple path repeatedly across multiple test files.
6. Do not write behaviorless tests only to increase coverage.
7. Do not repeat happy-path tests while missing boundary, error, empty, or invalid-value cases.
8. Do not repeatedly construct the same test data.
9. Do not duplicate test helpers or fixtures.
10. Do not let test helpers become more complex than the logic under test.
11. Do not test implementation details instead of behavioral outcomes.
12. Do not add meaningless tests only because a thin wrapper exists.

