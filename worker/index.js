/**
 * Cloudflare Worker — Form submission + Address Autocomplete proxy + GMB Reviews cache
 *
 * Routes:
 *   POST /                    → Lead form submission (saves to D1)
 *   GET  /autocomplete?q=...  → Proxy to Google Places Autocomplete
 *   GET  /place?id=...        → Proxy to Google Places Details
 *   GET  /reviews             → Cached GMB reviews from D1
 *
 * Cron:
 *   0 * / 6 * * *               → Sync reviews from GMB API into D1
 *
 * Secrets (set via `wrangler secret put <NAME>`):
 *   GMB_CLIENT_ID, GMB_CLIENT_SECRET, GMB_REFRESH_TOKEN,
 *   GMB_ACCOUNT_ID, GMB_LOCATION_ID
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS(request, env);
    }

    // Route: Cached GMB reviews
    if (url.pathname === '/reviews' && request.method === 'GET') {
      return handleGetReviews(request, env);
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

  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncGmbReviews(env));
  },
};

// ─── GMB Reviews — Cron Sync ──────────────────────────────────────────────────

const STAR_MAP = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

async function getGmbAccessToken(env) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GMB_CLIENT_ID,
      client_secret: env.GMB_CLIENT_SECRET,
      refresh_token: env.GMB_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`GMB token refresh failed: ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error('No access_token in GMB token response');
  return data.access_token;
}

async function syncGmbReviews(env) {
  try {
    const token = await getGmbAccessToken(env);
    const apiUrl =
      `https://mybusiness.googleapis.com/v4/accounts/${env.GMB_ACCOUNT_ID}` +
      `/locations/${env.GMB_LOCATION_ID}/reviews?pageSize=50`;

    const res = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`GMB reviews fetch failed: ${res.status}`);
    const data = await res.json();

    for (const review of (data.reviews || [])) {
      await env.DB.prepare(`
        INSERT INTO reviews (review_id, reviewer_name, photo_url, star_rating, comment, reply_comment, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(review_id) DO UPDATE SET
          reviewer_name  = excluded.reviewer_name,
          photo_url      = excluded.photo_url,
          star_rating    = excluded.star_rating,
          comment        = excluded.comment,
          reply_comment  = excluded.reply_comment
      `).bind(
        review.reviewId,
        review.reviewer?.displayName || 'Anonymous',
        review.reviewer?.profilePhotoUrl || '',
        STAR_MAP[review.starRating] || 0,
        review.comment || '',
        review.reviewReply?.comment || null,
        review.createTime || new Date().toISOString(),
      ).run();
    }

    console.log(`GMB sync complete — ${(data.reviews || []).length} reviews processed`);
  } catch (err) {
    console.error('GMB sync error:', err.message);
  }
}

// ─── GMB Reviews — GET /reviews ───────────────────────────────────────────────

function relativeTime(isoDate) {
  if (!isoDate) return '';
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? 's' : ''} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? 's' : ''} ago`;
  return `${Math.floor(days / 365)} year${Math.floor(days / 365) > 1 ? 's' : ''} ago`;
}

async function handleGetReviews(request, env) {
  try {
    const { results } = await env.DB.prepare(
      'SELECT * FROM reviews WHERE star_rating = 5 ORDER BY created_at DESC LIMIT 10'
    ).all();

    const countRow = await env.DB.prepare('SELECT COUNT(*) as total FROM reviews').first();

    const reviews = (results || []).map(r => ({
      author: r.reviewer_name,
      authorPhoto: r.photo_url,
      authorUri: '',
      rating: r.star_rating,
      text: r.comment,
      relativeTime: relativeTime(r.created_at),
      publishTime: r.created_at,
      googleMapsUri: 'https://search.google.com/local/reviews?placeid=ChIJo_uUdkhwDIgR0rK-6PvfVJ8',
    }));

    return new Response(JSON.stringify({
      rating: 5.0,
      totalReviews: countRow?.total || 0,
      reviews,
    }), {
      headers: corsHeaders(request, env),
    });
  } catch (err) {
    console.error('GET /reviews error:', err.message);
    return new Response(JSON.stringify({ rating: 5.0, totalReviews: 0, reviews: [] }), {
      headers: corsHeaders(request, env),
    });
  }
}

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
