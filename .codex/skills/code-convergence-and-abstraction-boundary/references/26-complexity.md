# Uncontrolled Complexity

## Applicability

Use this reference when functions, classes, modules, conditional expressions, `if`/`else` chains, data conversion, requests, state, rendering, error handling, caching, or side effects keep growing or mix responsibilities.

## Best Practices

1. Prefer guard clauses.
2. Keep a single function around 60-80 lines unless there is a clear reason.
3. Keep each function focused on one category of responsibility.
4. Refactor when conditional branching exceeds three levels.
5. Use strategy tables, mapping tables, or state machines after branching behavior stabilizes.
6. Extract complex expressions into named variables or named functions.
7. Split by responsibility boundaries instead of mechanically splitting by line count.

## Do Not

1. Do not over-nest control flow.
2. Do not keep deep conditional branches.
3. Do not let one function carry multiple responsibilities.
4. Do not keep God Functions.
5. Do not keep God Classes.
6. Do not let a single function keep growing without decomposition.
7. Do not leave complex conditional expressions unnamed.
8. Do not mix business decisions, side effects, and data conversion inside nested `if`/`else` blocks.
9. Do not make one module handle requests, state, conversion, rendering, errors, cache, and side effects at the same time.
10. Do not reduce function count at the cost of readability.

