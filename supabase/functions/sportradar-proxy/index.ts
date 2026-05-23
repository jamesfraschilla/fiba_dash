const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizePath(value: unknown) {
  const path = String(value || "").trim();
  if (!path) return "";
  return path.startsWith("/") ? path : `/${path}`;
}

function isAllowedPath(path: string) {
  if (!path.startsWith("/")) return false;
  if (path.includes("..") || path.includes("://")) return false;
  if (!path.endsWith(".json")) return false;
  return /^\/(competitions|seasons|sport_events)(\/|$)/.test(path);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed", status: 405 });
  }

  const sportradarApiKey = String(Deno.env.get("SPORTRADAR_API_KEY") || "").trim();
  const accessLevel = String(Deno.env.get("SPORTRADAR_ACCESS_LEVEL") || "trial").trim() || "trial";
  const language = String(Deno.env.get("SPORTRADAR_LANGUAGE") || "en").trim() || "en";

  if (!sportradarApiKey) {
    return jsonResponse(500, {
      error: "Missing SPORTRADAR_API_KEY secret.",
      status: 500,
    });
  }

  const body = await req.json().catch(() => ({}));
  const path = normalizePath(body?.path);

  if (!isAllowedPath(path)) {
    return jsonResponse(400, {
      error: "Invalid Sportradar path.",
      status: 400,
    });
  }

  const upstreamUrl = `https://api.sportradar.com/basketball/${accessLevel}/v2/${language}${path}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        accept: "application/json",
        "x-api-key": sportradarApiKey,
      },
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json";

    if (!upstream.ok) {
      return jsonResponse(upstream.status, {
        error: `Sportradar upstream request failed (${upstream.status}).`,
        status: upstream.status,
        detail: text.slice(0, 500),
      });
    }

    return new Response(text, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=120, s-maxage=120, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    return jsonResponse(502, {
      error: "Unable to reach Sportradar.",
      status: 502,
      detail: error instanceof Error ? error.message : "unknown",
    });
  }
});
