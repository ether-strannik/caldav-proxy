## CalDAV Proxy Architecture

GitHub: https://github.com/ether-strannik/caldav-proxy

### The Problem
Zepp OS has HTTP method limitations:
- Only supports GET and POST methods
- CalDAV requires PROPFIND, REPORT, PUT, DELETE methods

### The Solution
Vercel-hosted proxy server that translates HTTP methods:

```
┌─────────────┐     BLE      ┌─────────────┐    HTTPS     ┌─────────────┐    CalDAV    ┌─────────────┐
│   Watch     │ ◄──────────► │   Phone     │ ◄──────────► │   Vercel    │ ◄──────────► │  Nextcloud  │
│  (device)   │  msgBuilder  │  (app-side) │  POST +      │ caldav-proxy│  PROPFIND    │   Server    │
│             │              │             │  Override    │             │  REPORT etc  │             │
└─────────────┘              └─────────────┘              └─────────────┘              └─────────────┘
```

### Multi-User Support

The proxy supports multiple users with different Nextcloud servers via the `X-Target-Host` header:

```
Phone → Vercel:    POST /calendars/user/tasks/
                   X-Target-Host: https://my-nextcloud.com
                   X-HTTP-Method-Override: REPORT

Vercel → Nextcloud: REPORT https://my-nextcloud.com/calendars/user/tasks/
```

- **One shared proxy** works for all users
- User configures their Nextcloud URL in app settings
- App sends it as `X-Target-Host` header
- Proxy validates and forwards to user's server

### Vercel Proxy (api/proxy.js)
Hosted at: caldav-proxy-emn8.vercel.app

1. Reads target host from `X-Target-Host` header
2. Receives POST request with `X-HTTP-Method-Override` header
3. Extracts actual method from header
4. Forwards to user's Nextcloud server with correct CalDAV method
5. Strips cookies to avoid session conflicts
6. Adds CORS headers for cross-origin access
7. Returns response to client

```javascript
// Multi-user target host
const targetHost = req.headers['x-target-host'];

// Method override detection
let method = req.method;  // POST
const methodOverride = req.headers['x-http-method-override'];
if (methodOverride && req.method === 'POST') {
  method = methodOverride.toUpperCase();  // PROPFIND, REPORT, etc.
}
```

### Request Flow Example (list tasks)

1. Watch → Phone: `{package: "caldav_proxy", action: "list_tasks"}`
2. Phone → Vercel: `POST /calendars/user/tasks/` + `X-Target-Host: https://my-nextcloud.com` + `X-HTTP-Method-Override: REPORT`
3. Vercel → Nextcloud: `REPORT https://my-nextcloud.com/calendars/user/tasks/`
4. Nextcloud → Vercel: XML with VTODO data
5. Vercel → Phone: Forward XML response
6. Phone → Watch: Parsed task objects

### Why Vercel?

- Zepp OS phone app also has HTTP method limitations
- Serverless = no server maintenance
- Free tier sufficient for personal use
- Stable HTTPS endpoint
- Multi-user without per-user deployment

---

## CalDAV Proxy Setup (Self-Hosted)

For users who want to run their own proxy instance.

### Required Files (3 files total)

```
caldav-proxy/
├── api/
│   └── proxy.js        # Serverless function
├── package.json        # Project config
└── vercel.json         # URL routing
```

### Step 1: Create Project Files

**package.json**
```json
{
  "name": "caldav-proxy",
  "version": "1.0.0",
  "private": true,
  "type": "module"
}
```

**vercel.json**
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/api/proxy" }
  ]
}
```

**api/proxy.js**
- Copy the proxy.js file from this repo
- Optionally set `CALDAV_DEFAULT_HOST` env var for backwards compatibility

### Step 2: Create GitHub Repo

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create caldav-proxy --public --source=. --push
```

### Step 3: Deploy on Vercel

1. Go to vercel.com → Sign in with GitHub
2. "Add New Project" → Import caldav-proxy repo
3. Click Deploy (no config needed)
4. Get URL: `https://caldav-proxy-xxx.vercel.app`

### Step 4: Configure ZeppOS App

If using self-hosted proxy, update `PROXY_URL` in `app-side/CalDAVProxy.js`:
```javascript
const PROXY_URL = "https://your-proxy.vercel.app";
```

### How It Works

```
Request to: caldav-proxy-emn8.vercel.app/remote.php/dav/calendars/user/tasks/
Header:     X-Target-Host: https://your-nextcloud.com
Proxied to: your-nextcloud.com/remote.php/dav/calendars/user/tasks/
```

The vercel.json rewrites ALL paths to api/proxy, which reads the target from the header and forwards the request.

---

## Security Considerations

- **Basic validation**: Proxy accepts any target host (open relay potential)
- **HTTPS only**: Target hosts should use HTTPS
- **No credential storage**: Auth header passes through, not stored
- **Rate limiting**: Consider adding if abuse occurs
- **Allowlist option**: For restricted deployments, add allowed hosts validation
