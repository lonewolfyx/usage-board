# Request Convergence

## Applicability

Use this reference for repeated URLs, repeated parameters, repeated error handling, repeated normalization, and repeated caching strategies.

## Best Practices

1. Use a request instance for shared low-level request behavior.
2. Use an API client for endpoint definitions and request methods.
3. Use services or repositories for business-semantic entry points.
4. Use query builders for shared query-parameter construction.
5. Use response normalizers for response shaping.

## Do Not

1. Do not build URLs, queries, or bodies in page-level code.
2. Do not bypass the unified request instance.
3. Do not create multiple normalization versions for the same endpoint.
4. Do not scatter cache, retry, timeout, or cancellation logic across call sites.

