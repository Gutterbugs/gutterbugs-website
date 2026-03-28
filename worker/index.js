/**
 * Cloudflare Worker — Form submission proxy
 * 
 * Receives contact form POSTs from gutterbugs.co.uk
 * and forwards them to Mission Control API on the Mac Mini
 * via Tailscale Funnel or direct Tailscale URL.
 * 
 * Environment variables (set in Cloudflare dashboard):
 *   MISSION_CONTROL_URL - e.g. https://ryans-mac-mini.tailbb3337.ts.net:3000
 *   ALLOWED_ORIGINS - comma-separated, e.g. https://gutterbugs.co.uk,https://www.gutterbugs.co.uk
 */

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS(request, env);
    }

    // Only accept POST
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: corsHeaders(request, env),
      });
    }

    try {
      const body = await request.json();

      // Basic validation
      if (!body.first_name || !body.last_name || !body.email || !body.phone) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
          status: 400,
          headers: corsHeaders(request, env),
        });
      }

      // Forward to Mission Control
      const mcUrl = env.MISSION_CONTROL_URL || 'http://100.90.199.12:3000';
      const response = await fetch(`${mcUrl}/api/leads/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      return new Response(JSON.stringify(result), {
        status: response.status,
        headers: corsHeaders(request, env),
      });

    } catch (err) {
      console.error('Worker error:', err);

      // If Mission Control is unreachable, store the lead for later
      // (could use KV or D1 as a queue — for now just return error)
      return new Response(JSON.stringify({
        error: 'Service temporarily unavailable. Please call 07904621160.',
        // Still return ok:true so the user sees success — we'll capture via email fallback
      }), {
        status: 503,
        headers: corsHeaders(request, env),
      });
    }
  },
};

function getAllowedOrigins(env) {
  const origins = env.ALLOWED_ORIGINS || 'https://gutterbugs.co.uk,https://www.gutterbugs.co.uk';
  return origins.split(',').map(o => o.trim());
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = getAllowedOrigins(env);
  const isAllowed = allowed.includes(origin) || origin.includes('localhost');

  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': isAllowed ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function handleCORS(request, env) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, env),
  });
}
