import type { VercelRequest, VercelResponse } from '@vercel/node';
// Explicitly import Buffer from the built-in buffer module to fix 'Cannot find name Buffer' error
import { Buffer } from 'buffer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing URL parameter' });
  }

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    // Copy headers from source to bypass restrictions
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // Stream the body to the client
    const arrayBuffer = await response.arrayBuffer();
    // Use imported Buffer to convert arrayBuffer for response sending
    const buffer = Buffer.from(arrayBuffer);
    
    return res.send(buffer);
  } catch (error: any) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
}
