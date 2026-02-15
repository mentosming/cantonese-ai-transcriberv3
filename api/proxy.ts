
export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const targetUrl = url.searchParams.get('url');

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range, User-Agent, Authorization, X-Requested-With',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type, Content-Disposition',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing URL' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const requestHeaders = new Headers();
    requestHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    
    const range = req.headers.get('Range');
    if (range) requestHeaders.set('Range', range);

    const response = await fetch(targetUrl, {
      headers: requestHeaders,
      redirect: 'follow',
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(`Upstream returned ${response.status}`);
    }

    const responseHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value);
    });

    // Strip some security headers that might block the browser
    responseHeaders.delete('Content-Security-Policy');
    responseHeaders.delete('X-Frame-Options');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
