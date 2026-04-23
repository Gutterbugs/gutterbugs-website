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

    // Route: Telegram webhook (building confirmation callbacks)
    if (url.pathname === '/telegram-webhook' && request.method === 'POST') {
      return handleTelegramWebhook(request, env);
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

    // Instant Telegram notification (SYNCHRONOUS — await ensures delivery before response)
    // Previously used ctx.waitUntil which fired-and-forgot; Cloudflare sometimes preempts
    // the waitUntil promise before the Telegram call completes, causing missed notifications.
    // Awaiting adds ~200-400ms to form submit response time — invisible to the user.
    // Use dedicated LEADS_BOT_TOKEN if set, fall back to TELEGRAM_BOT_TOKEN
    const botToken = env.LEADS_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;
    if (botToken && env.TELEGRAM_CHAT_ID) {
      try {
        await sendTelegramNotification(env, body, result.meta.last_row_id, botToken);
      } catch (err) {
        console.error('Telegram notification failed:', err.message);
      }
    }

    // Instant auto-acknowledgment email to customer (non-blocking)
    if (env.RESEND_API_KEY && body.email) {
      const emailPromise = sendAutoAcknowledgment(env, body);
      if (ctx?.waitUntil) ctx.waitUntil(emailPromise);
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

async function sendTelegramNotification(env, lead, leadId, botToken) {
  botToken = botToken || env.LEADS_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;
  const name = `${lead.first_name} ${lead.last_name}`.trim();
  const services = lead.service_type || 'Not specified';
  const source = lead.source || 'direct';
  const phone = lead.phone || '';
  const address = lead.address ? `${lead.address}${lead.postcode ? ', ' + lead.postcode : ''}` : '';

  const message = [
    `🪲 *New Lead!*`,
    `*${name}*` + (services !== 'Not specified' ? ` — ${services}` : ''),
    address ? `📍 ${address}` : '',
    phone ? `📞 [${phone}](tel:${phone.replace(/\s/g, '')})` : '',
    lead.email ? `✉️ ${lead.email}` : '',
    lead.message ? `💬 _"${lead.message}"_` : '',
    `🔗 Source: ${source}`,
    lead.gclid ? `📊 Google Ads click` : '',
  ].filter(Boolean).join('\n');

  // Build inline keyboard
  const keyboard = [];

  // Row 1: Apple Maps link (if address available)
  if (address) {
    const mapsUrl = `https://maps.apple.com/?address=${encodeURIComponent(address)}`;
    keyboard.push([{ text: '🗺️ View in Apple Maps', url: mapsUrl }]);
  }

  // Note: confirm buttons are sent in a follow-up message by Mission Control
  // once the satellite measurement completes (~30s), so Ryan can see the building
  // before confirming. Keeping this message fast & text-only for instant delivery.

  try {
    const payload = {
      chat_id: env.TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown',
    };

    if (keyboard.length > 0) {
      payload.reply_markup = JSON.stringify({ inline_keyboard: keyboard });
    }

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error('Telegram send failed:', await res.text());
    }
  } catch (err) {
    console.error('Telegram notify error:', err.message);
  }
}

// ─── Auto-Acknowledgment Email ────────────────────────────────────────────────

const SERVICE_LABELS = {
  gutter_cleaning: 'Gutter Cleaning',
  roof_scraping: 'Roof Moss Removal',
  roof_pressure: 'Roof Pressure Washing',
  driveway: 'Driveway/Patio Cleaning',
  soffit_fascia: 'Soffit & Fascia Washing',
  conservatory_roof: 'Conservatory Roof Washing',
  solar_panels: 'Solar Panel Washing',
  other: 'Other Services',
};

async function sendAutoAcknowledgment(env, lead) {
  const firstName = (lead.first_name || '').trim();
  const services = (lead.service_type || '')
    .split(',')
    .map(s => SERVICE_LABELS[s.trim()] || s.trim())
    .filter(Boolean);

  const serviceText = services.length > 0
    ? services.join(', ')
    : 'your property';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #0ea5e9; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 22px;">Thanks for getting in touch${firstName ? `, ${firstName}` : ''}!</h1>
  </div>
  <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
    <p>We've received your enquiry for <strong>${serviceText}</strong>. Our automated system is already measuring your property from satellite imagery — your quote will arrive shortly.</p>
    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: #78350f;"><strong>What happens next:</strong></p>
      <ol style="font-size: 14px; color: #78350f; padding-left: 20px; margin: 8px 0 0;">
        <li>We assess your property using satellite imagery (usually under 2 minutes)</li>
        <li>Ryan reviews the automated measurement for accuracy</li>
        <li>A detailed, itemised quote is emailed to you from Xero</li>
      </ol>
    </div>
    <p>If you'd like to speak with Ryan directly, feel free to call:</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="tel:07904621160" style="display: inline-block; background: #0ea5e9; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">📞 Call 07904 621160</a>
    </div>
    <p style="font-size: 14px; color: #64748b;">We cover Hertfordshire, Buckinghamshire & surrounding areas. Full terms: <a href="https://gutterbugs.co.uk/terms" style="color: #0ea5e9;">gutterbugs.co.uk/terms</a></p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
    <p style="font-size: 13px; color: #94a3b8; margin: 0;">Gutterbugs Exterior Cleaning<br>Hertfordshire & Buckinghamshire<br><a href="https://gutterbugs.co.uk" style="color: #0ea5e9;">gutterbugs.co.uk</a></p>
  </div>
</body>
</html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Gutterbugs <quotes@gutterbugs.co.uk>',
        to: [lead.email],
        reply_to: 'ryan@gutterbugs.co.uk',
        subject: `We've received your enquiry${services.length > 0 ? ` for ${services[0]}` : ''}!`,
        html,
      }),
    });
    if (!res.ok) {
      console.error('Auto-ack email failed:', await res.text());
    }
  } catch (err) {
    console.error('Auto-ack email error:', err.message);
  }
}


// ─── Telegram Webhook — Building Confirmation Callbacks ───────────────────────

async function handleTelegramWebhook(request, env) {
  try {
    const update = await request.json();

    // Handle callback queries (inline button presses)
    if (update.callback_query) {
      const { id: callbackId, data, from, message } = update.callback_query;

      // Parse callback data: "confirm:LEAD_ID:yes" or "confirm:LEAD_ID:no"
      const match = data?.match(/^confirm:(\d+):(yes|no)$/);
      if (!match) {
        await answerCallback(env, callbackId, '⚠️ Unknown action');
        return new Response('ok');
      }

      const leadId = parseInt(match[1]);
      const confirmed = match[2];

      // Ensure building_confirmations table exists (idempotent)
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS building_confirmations (
          lead_id INTEGER PRIMARY KEY,
          confirmed TEXT NOT NULL,
          confirmed_by TEXT,
          confirmed_at TEXT DEFAULT (datetime('now')),
          synced_to_mc INTEGER DEFAULT 0
        )
      `).run();

      // Check if already confirmed
      const existing = await env.DB.prepare(
        'SELECT confirmed FROM building_confirmations WHERE lead_id = ?'
      ).bind(leadId).first();

      if (existing) {
        const emoji = existing.confirmed === 'yes' ? '✅' : '❌';
        await answerCallback(env, callbackId, `Already ${emoji} ${existing.confirmed === 'yes' ? 'confirmed' : 'rejected'}`);
        return new Response('ok');
      }

      // Store confirmation
      await env.DB.prepare(
        'INSERT INTO building_confirmations (lead_id, confirmed, confirmed_by) VALUES (?, ?, ?)'
      ).bind(leadId, confirmed, `telegram:${from.id}`).run();

      // Answer the callback
      const emoji = confirmed === 'yes' ? '✅' : '❌';
      const label = confirmed === 'yes' ? 'Building confirmed!' : 'Building rejected — flagged for review';
      await answerCallback(env, callbackId, `${emoji} ${label}`);

      // Update the original message to show the result
      if (message?.chat?.id && message?.message_id) {
        const newText = message.text + `\n\n${emoji} *${label}*` + ` (by ${from.first_name || 'user'})`;
        await fetch(`https://api.telegram.org/bot${env.LEADS_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: message.chat.id,
            message_id: message.message_id,
            text: newText,
            parse_mode: 'Markdown',
            reply_markup: JSON.stringify({ inline_keyboard: [] }),
          }),
        });
      }

      return new Response('ok');
    }

    return new Response('ok');
  } catch (err) {
    console.error('Telegram webhook error:', err);
    return new Response('ok');
  }
}

async function answerCallback(env, callbackId, text) {
  await fetch(`https://api.telegram.org/bot${env.LEADS_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId, text, show_alert: true }),
  });
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
