
import type { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';
import { pipeline } from 'stream';
import { promisify } from 'util';

const streamPipeline = promisify(pipeline);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing URL parameter' });
  }

  try {
    // Determine if we need to add a Referer header (often needed for GoogleVideo links)
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    // If fetching from googlevideo (YouTube), we might need origin/referer
    if (url.includes('googlevideo.com')) {
        headers['Origin'] = 'https://www.youtube.com';
        headers['Referer'] = 'https://www.youtube.com/';
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`Failed to fetch source: ${response.statusText} (${response.status})`);
    }

    // Forward important headers
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentLength = response.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    if (contentLength) {
        res.setHeader('Content-Length', contentLength);
    }

    // CRITICAL FIX: Stream the data instead of buffering it.
    // This prevents Vercel 10s timeout and 1024MB memory limit crashes.
    if (!response.body) throw new Error("No response body");
    
    // @ts-ignore - node-fetch body is compatible with stream pipeline
    await streamPipeline(response.body, res);

  } catch (error: any) {
    console.error('Streaming Proxy Error:', error);
    // Only send JSON error if headers haven't been sent yet
    if (!res.headersSent) {
        res.status(500).json({ error: error.message || 'Streaming failed' });
    } else {
        res.end();
    }
  }
}
