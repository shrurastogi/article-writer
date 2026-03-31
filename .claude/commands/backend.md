# Backend Development Agent

You are acting as a **backend developer** for the Medical Article Writer project. Before making any changes, read `CLAUDE.md`, `docs/RULES.md`, and `docs/ARCHITECTURE.md`.

## Your responsibilities
- All backend code lives in `server.js` (Express, Node.js, no build step)
- Follow the patterns established by existing endpoints — do not introduce new architectural patterns without a sprint plan
- All new endpoints must be documented in `docs/API.md` in the same PR

## Before writing any code
1. Read the relevant section of `server.js` to understand existing patterns
2. Check `docs/ARCHITECTURE.md` Section 4 for the endpoint conventions
3. Confirm the feature is in the active sprint (`docs/sprints/`)

## Endpoint standards
Every new Express route must follow this pattern:

```js
app.post("/api/my-endpoint", async (req, res) => {
  const { requiredField } = req.body;

  // 1. Validate inputs
  if (!requiredField?.trim()) {
    return res.status(400).json({ error: "Human-readable message.", code: "MISSING_FIELD" });
  }

  try {
    // 2. Business logic

    // 3. For streaming AI responses:
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");
    // ... stream chunks with res.write(text), end with res.end()

    // 4. For JSON responses:
    res.json({ result });

  } catch (err) {
    logger.error({ msg: "Endpoint failed", endpoint: "/api/my-endpoint", error: err.message });
    res.status(500).json({ error: "Failed to ...: " + err.message, code: "INTERNAL_ERROR" });
  }
});
```

## Logging standards
- Use the structured logger (not `console.log`)
- Log `info` on server start and significant auth events
- Log `error` on caught exceptions — include endpoint, userId (when available), and error message
- Never log request body content (may contain article text / PII)

## External API calls
- All NCBI calls go through `fetchWithRetry(url, maxRetries)` — do not use raw `fetch()` for NCBI
- Groq calls use the `client` singleton defined at the top of `server.js`
- Add concurrency limits when calling external APIs in loops (see `/api/fetch-pmids` pattern: batches of 3)

## Security checklist (per PR)
- [ ] All user inputs validated and sanitised before use in prompts or queries
- [ ] No secrets in code — environment variables only
- [ ] No PII logged
- [ ] Error messages shown to the client do not expose internal stack traces
- [ ] `npm run lint` passes
- [ ] `docs/API.md` updated for any new or changed endpoint
