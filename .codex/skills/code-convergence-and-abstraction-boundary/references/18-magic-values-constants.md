# Magic Values and Duplicate Constants

## Applicability

Use this reference when code contains business status strings, endpoint paths, event names, cache keys, storage keys, route names or paths, regular expressions, intervals, page sizes, defaults, config values, or constants.

## Best Practices

1. Move business states, paths, keys, regular expressions, intervals, page sizes, and defaults into clearly named constants or configuration objects.
2. Keep constants close to their domain or foundational shared capability instead of scattering them through page code.
3. Derive type value domains from runtime constants to avoid double maintenance.
4. Maintain each constant in exactly one location.
5. Name constants by business meaning rather than implementation detail.

## Do Not

1. Do not scatter magic strings.
2. Do not scatter magic numbers.
3. Do not define the same constant repeatedly.
4. Do not define the same configuration item repeatedly.
5. Do not write business status strings directly inside conditions.
6. Do not scatter endpoint paths.
7. Do not scatter event names.
8. Do not scatter cache keys.
9. Do not scatter storage keys.
10. Do not scatter route names or paths.
11. Do not define the same regular expression repeatedly.
12. Do not define the same interval repeatedly.
13. Do not define the same page size repeatedly.
14. Do not define the same default value repeatedly.
15. Do not maintain the same constant separately in multiple modules.

