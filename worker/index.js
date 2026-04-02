/**
 * Cloudflare Worker — Form submission + Address Autocomplete proxy
 * 
 * Routes:
 *   POST /                    → Lead form submission (saves to D1)
 *   GET  /autocomplete?q=...  → Proxy to Google Places Autocomplete
 *   GET  /place?id=...        → Proxy to Google Places Details
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS(request, env);
    }

    // Route: Address autocomplete proxy
    if (url.pathname === '/autocomplete' && request.method === 'GET') {
      return handleAutocomplete(url, request, env);
    }

    // Route: Place details proxy
    if (url.pathname === '/place' && request.method === 'GET') {
      return handlePlaceDetails(url, request, env);
    }

    // Route: Form submission (existing)
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: corsHeaders(request, env),
      });
    }

    return handleFormSubmission(request, env, ctx);
  },
};

// ─── Address Autocomplete Proxy ───────────────────────────────────────────────

async function handleAutocomplete(url, request, env) {
  const query = url.searchParams.get('q');
  if (!query || query.length < 3) {
    return new Response(JSON.stringify({ suggestions: [] }), {
      headers: corsHeaders(request, env),
    });
  }

  const apiKey = env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: corsHeaders(request, env),
    });
  }

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify({
        input: query,
        includedRegionCodes: ['gb'],
        languageCode: 'en-GB',
      }),
    });

    const data = await response.json();

    // Return simplified suggestions
    const suggestions = (data.suggestions || [])
      .filter(s => s.placePrediction)
      .map(s => ({
        placeId: s.placePrediction.placeId,
        main: s.placePrediction.structuredFormat?.mainText?.text || '',
        secondary: s.placePrediction.structuredFormat?.secondaryText?.text || '',
      }));

    return new Response(JSON.stringify({ suggestions }), {
      headers: corsHeaders(request, env),
    });

  } catch (err) {
    return new Response(JSON.stringify({ suggestions: [] }), {
      headers: corsHeaders(request, env),
    });
  }
}

async function handlePlaceDetails(url, request, env) {
  const placeId = url.searchParams.get('id');
  if (!placeId) {
    return new Response(JSON.stringify({ error: 'Missing place ID' }), {
      status: 400,
      headers: corsHeaders(request, env),
    });
  }

  const apiKey = env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: corsHeaders(request, env),
    });
  }

  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'addressComponents,location,formattedAddress,shortFormattedAddress',
      },
    });

    const data = await response.json();

    // Extract structured components
    let streetNumber = '';
    let route = '';
    let city = '';
    let county = '';
    let postcode = '';
    let lat = null;
    let lng = null;

    for (const c of (data.addressComponents || [])) {
      const types = c.types || [];
      if (types.includes('street_number')) streetNumber = c.longText || '';
      if (types.includes('route')) route = c.longText || '';
      if (types.includes('postal_town')) city = c.longText || '';
      if (types.includes('locality') && !city) city = c.longText || '';
      if (types.includes('administrative_area_level_2')) county = c.longText || '';
      if (types.includes('postal_code')) postcode = c.longText || '';
    }

    if (data.location) {
      lat = data.location.latitude;
      lng = data.location.longitude;
    }

    const streetAddress = streetNumber ? `${streetNumber} ${route}` : route;

    return new Response(JSON.stringify({
      address: streetAddress || data.shortFormattedAddress || data.formattedAddress || '',
      postcode,
      city,
      county,
      lat,
      lng,
    }), {
      headers: corsHeaders(request, env),
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to fetch details' }), {
      status: 500,
      headers: corsHeaders(request, env),
    });
  }
}

// ─── Form Submission ──────────────────────────────────────────────────────────

async function handleFormSubmission(request, env, ctx) {
  try {
    const body = await request.json();

    if (!body.first_name || !body.last_name || !body.email || !body.phone) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: corsHeaders(request, env),
      });
    }

    const result = await env.DB.prepare(`
      INSERT INTO leads (first_name, last_name, email, phone, address, postcode, service_type, message, gclid, source, landing_page, referrer, utm_source, utm_medium, utm_campaign, utm_term, address_city, address_county, address_lat, address_lng)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      body.address_city || null,
      body.address_county || null,
      body.address_lat || null,
      body.address_lng || null,
    ).run();

    if (env.MISSION_CONTROL_URL) {
      const mcPromise = (async () => {
        try {
          const mcResponse = await fetch(`${env.MISSION_CONTROL_URL}/api/leads/capture`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (mcResponse.ok) {
            await env.DB.prepare('UPDATE leads SET synced_to_mc = 1 WHERE id = ?')
              .bind(result.meta.last_row_id).run();
          }
        } catch (e) {
          console.log('MC push failed (will sync later):', e.message);
        }
      })();
      if (ctx?.waitUntil) ctx.waitUntil(mcPromise);
    }

    // Instant Telegram notification (non-blocking)
    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      const tgPromise = sendTelegramNotification(env, body);
      if (ctx?.waitUntil) ctx.waitUntil(tgPromise);
    }

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
}

// ─── Telegram Notification ────────────────────────────────────────────────────

async function sendTelegramNotification(env, lead) {
  const name = `${lead.first_name} ${lead.last_name}`.trim();
  const services = lead.service_type || 'Not specified';
  const source = lead.source || 'direct';
  const phone = lead.phone || '';

  const message = [
    `🪲 *New Lead!*`,
    `*${name}*` + (services !== 'Not specified' ? ` — ${services}` : ''),
    lead.address ? `📍 ${lead.address}${lead.postcode ? ', ' + lead.postcode : ''}` : '',
    phone ? `📞 [${phone}](tel:${phone.replace(/\s/g, '')})` : '',
    lead.email ? `✉️ ${lead.email}` : '',
    lead.message ? `💬 _"${lead.message}"_` : '',
    `🔗 Source: ${source}`,
    lead.gclid ? `📊 Google Ads click` : '',
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
      }),
    });
    if (!res.ok) {
      console.error('Telegram send failed:', await res.text());
    }
  } catch (err) {
    console.error('Telegram notify error:', err.message);
  }
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
