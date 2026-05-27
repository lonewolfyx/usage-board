# Duplicate Requests and API Entry Points

## Applicability

Use this reference when adding or changing API calls, URLs, paths, query parameters, request bodies, headers, tokens, content types, error codes, authentication, response cleanup, normalization, caching, retries, timeouts, or cancellation.

## Best Practices

1. Keep one recommended entry point for each backend endpoint.
2. Route page and component access through a composable, service or repository, API client, and request instance boundary.
3. Centralize URL construction, query construction, body construction, headers, authentication, and error-code handling at the request boundary or service layer.
4. Normalize a response once and expose a stable ViewModel to UI code.
5. Implement caching, retry, timeout, and cancellation behavior in shared request infrastructure or an explicit service boundary.

## Do Not

1. Do not create multiple call entry points for the same endpoint.
2. Do not call the same endpoint through multiple clients such as `fetch`, `ofetch`, `useFetch`, and `axios`.
3. Do not scatter endpoint URLs in page-level code.
4. Do not repeatedly concatenate API paths.
5. Do not repeatedly build query parameters.
6. Do not repeatedly build request bodies.
7. Do not repeatedly set headers, tokens, or content types.
8. Do not repeatedly handle the same error codes.
9. Do not implement identical authentication logic per endpoint.
10. Do not repeatedly clean up API responses in page-level code.
11. Do not normalize the same response in multiple places.
12. Do not bypass the unified API client, service, or repository to call the backend directly.
13. Do not leak raw API response structures into all page layers unless the response is already a stable ViewModel.
14. Do not scatter cache, retry, timeout, or cancellation logic across call sites.

