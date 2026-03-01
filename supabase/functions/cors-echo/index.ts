import { getCorsHeaders, handlePreflight } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handlePreflight(req);
  const corsHeaders = getCorsHeaders(req);
  const origin = req.headers.get("origin") ?? "(none)";

  return new Response(
    JSON.stringify({
      request_origin: origin,
      response_headers: corsHeaders,
      method: req.method,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
