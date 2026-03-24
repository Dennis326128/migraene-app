# Testing

## App Tests (Node / Vitest)

```bash
npm test          # or: npx vitest run
```

Runs all tests in `src/**/*.{test,spec}.{ts,tsx}` using Vitest with jsdom.

## Build Check

```bash
npm run build
```

## Edge Function Tests (Deno)

Tests under `supabase/functions/` use Deno-native `https:` imports and `Deno.test()`.
They are **intentionally excluded** from the standard Vitest run via `vitest.config.ts` →
`exclude: ["supabase/functions/**"]`. This is not a skip of broken tests — it reflects the
separation of two different runtimes (Node vs Deno).

To run Edge Function tests:

```bash
npx supabase functions test
# or directly:
deno test supabase/functions/weatherAssociation.test.ts --allow-net --allow-env
```

## Summary

| Scope | Runtime | Command |
|-------|---------|---------|
| App logic & components | Node / Vitest / jsdom | `npm test` |
| Supabase Edge Functions | Deno | `npx supabase functions test` |
