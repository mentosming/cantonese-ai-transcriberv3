
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const targetUrl = url.searchParams.get('url');

  // Define robust CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range, User-Agent, Authorization',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type, Content-Disposition',
    'Cache-Control': 'public, max-age=3600'
  };

  // 1. Handle Preflight (OPTIONS) requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing URL parameter' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // 2. Prepare headers for the target request
    const requestHeaders: HeadersInit = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    // Forward Range header if the client requested a partial download
    const range = req.headers.get('Range');
    if (range) {
      requestHeaders['Range'] = range;
    }

    // 3. Fetch from target
    const response = await fetch(targetUrl, {
      headers: requestHeaders,
      redirect: 'follow', // Follow redirects automatically
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(`Target fetch failed: ${response.status} ${response.statusText}`);
    }

    // 4. Construct response with CORS headers
    const responseHeaders = new Headers(response.headers);
    
    // Overwrite/Set CORS headers on the response
    Object.entries(corsHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value);
    });

    // Ensure content-type is passed through or defaulted
    if (!responseHeaders.has('Content-Type')) {
        responseHeaders.set('Content-Type', 'application/octet-stream');
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });

  } catch (error: any) {
    console.error("Proxy Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Proxy Internal Error" }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
