// CalDAV Proxy for ZeppOS
// Forwards requests to Nextcloud/CalDAV servers with correct HTTP methods
// Multi-user: Target host passed via X-Target-Host header

// Fallback for backwards compatibility (optional)
const DEFAULT_HOST = process.env.CALDAV_DEFAULT_HOST || null;

export default async function handler(req, res) {
  // Get target host from header or fallback to default
  let targetHost = req.headers['x-target-host'] || DEFAULT_HOST;

  // Validate target host
  if (!targetHost) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing X-Target-Host header. Please configure your Nextcloud URL in the app.');
    return;
  }

  // Basic validation: must look like a CalDAV endpoint
  if (!targetHost.includes('/remote.php/dav') && !targetHost.includes('/dav')) {
    // Allow if it's just a base URL (we'll append the path)
    if (!targetHost.startsWith('http://') && !targetHost.startsWith('https://')) {
      targetHost = 'https://' + targetHost;
    }
  }

  // Remove trailing slash from host
  if (targetHost.endsWith('/')) {
    targetHost = targetHost.slice(0, -1);
  }

  // Get the path from the URL (everything after the proxy domain)
  const url = new URL(req.url, `http://${req.headers.host}`);
  const targetPath = url.pathname + url.search;
  const targetUrl = targetHost + targetPath;

  // Determine the actual HTTP method
  let method = req.method;
  const methodOverride = req.headers['x-http-method-override'] ||
                         req.headers['x-http-method'];
  if (methodOverride && req.method === 'POST') {
    method = methodOverride.toUpperCase();
  }

  console.log(`Proxy: ${method} ${targetUrl}`);

  // Build headers for the target request (strip cookies to avoid session issues)
  const headers = {};
  const skipHeaders = ['host', 'x-http-method-override', 'x-http-method',
                       'x-target-host', 'connection', 'x-forwarded-for',
                       'x-forwarded-proto', 'x-vercel-id', 'x-vercel-deployment-url',
                       'cookie'];

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

    // Forward response headers (strip cookies to avoid session issues)
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      // Skip headers that shouldn't be forwarded
      const skip = ['content-encoding', 'transfer-encoding', 'connection', 'set-cookie'];
      if (!skip.includes(key.toLowerCase())) {
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
