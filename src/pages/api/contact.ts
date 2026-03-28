import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  const data = await request.json();

  // Forward to configurable endpoint
  const endpoint = import.meta.env.FORM_ENDPOINT || 'https://httpbin.org/post';

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        timestamp: new Date().toISOString(),
        site: 'gutterbugs.co.uk'
      })
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Failed to submit' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
