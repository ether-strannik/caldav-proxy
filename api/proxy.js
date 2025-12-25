// CalDAV Proxy for ZeppOS
// Forwards requests to Nextcloud with correct HTTP methods

const TARGET_HOST = 'https://kai.nl.tab.digital';

export default async function handler(req, res) {
  // Get the path from the URL (everything after the proxy domain)
  const url = new URL(req.url, `http://${req.headers.host}`);
  const targetPath = url.pathname + url.search;
  const targetUrl = TARGET_HOST + targetPath;

  // Determine the actual HTTP method
  let method = req.method;
  const methodOverride = req.headers['x-http-method-override'] ||
                         req.headers['x-http-method'];
  if (methodOverride && req.method === 'POST') {
    method = methodOverride.toUpperCase();
  }

  console.log(`Proxy: ${method} ${targetUrl}`);

  // Build headers for the target request
  const headers = {};
  const skipHeaders = ['host', 'x-http-method-override', 'x-http-method',
                       'connection', 'x-forwarded-for', 'x-forwarded-proto',
                       'x-vercel-id', 'x-vercel-deployment-url'];

  for (const [key, value] of Object.entries(req.headers)) {
    if (!skipHeaders.includes(key.toLowerCase())) {
      headers[key] = value;
    }
  }

  try {
    // Read request body
    let body = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      if (chunks.length > 0) {
        body = Buffer.concat(chunks);
      }
    }

    // Make request to Nextcloud
    const response = await fetch(targetUrl, {
      method: method,
      headers: headers,
      body: body,
    });

    // Forward response headers
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      // Skip some headers that shouldn't be forwarded
      if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    });

    // Set CORS headers to allow requests from anywhere
    responseHeaders['Access-Control-Allow-Origin'] = '*';
    responseHeaders['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, PROPFIND, PROPPATCH, REPORT, OPTIONS';
    responseHeaders['Access-Control-Allow-Headers'] = '*';

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(200, responseHeaders);
      res.end();
      return;
    }

    // Get response body
    const responseBody = await response.text();

    // Send response
    res.writeHead(response.status, responseHeaders);
    res.end(responseBody);

  } catch (error) {
    console.error('Proxy error:', error);
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end(`Proxy error: ${error.message}`);
  }
}
