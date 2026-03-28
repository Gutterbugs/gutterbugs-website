/**
 * Cloudflare Worker — Form submission handler
 * 
 * Receives contact form POSTs from the Gutterbugs website
 * and saves them directly to D1 (Cloudflare's database).
 * 
 * No tunnel or external server needed — leads are stored
 * on Cloudflare's edge, always available.
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

      // Save to D1
      const result = await env.DB.prepare(`
        INSERT INTO leads (first_name, last_name, email, phone, address, postcode, service_type, message, gclid, source, landing_page, referrer, utm_source, utm_medium, utm_campaign, utm_term)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        body.first_name,
        body.last_name,
        body.email,
        body.phone,
        body.address || null,
        body.postcode || null,
        body.service_type || null,
        body.message || null,
        body.gclid || null,
        body.source || null,
        body.landing_page || null,
        body.referrer || null,
        body.utm_source || null,
        body.utm_medium || null,
        body.utm_campaign || null,
        body.utm_term || null,
      ).run();

      return new Response(JSON.stringify({
        ok: true,
        lead: {
          id: result.meta.last_row_id,
          name: `${body.first_name} ${body.last_name}`,
          status: 'new',
        },
      }), {
        status: 200,
        headers: corsHeaders(request, env),
      });

    } catch (err) {
      console.error('Worker error:', err);
      return new Response(JSON.stringify({
        error: 'Something went wrong. Please call 07904 621160.',
      }), {
        status: 500,
        headers: corsHeaders(request, env),
      });
    }
  },
};

function getAllowedOrigins(env) {
  const origins = env.ALLOWED_ORIGINS || 'https://gutterbugs.co.uk,https://www.gutterbugs.co.uk,https://gutterbugs-website.pages.dev';
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
