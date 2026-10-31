# Production and launch gates

No hosting provider or domain has been selected. No deployment has been performed.

## Same-origin arrangement

Serve the Vite `dist` directory on HTTPS at the selected custom domain. Forward `/api/` to the canonical FastAPI application `backend.main:app` listening only on 127.0.0.1:3002, or the configured private service address. The Vite proxy is development-only. Do not deploy the compatibility Node server in place of FastAPI.

For an Nginx deployment, this is the relevant server-block fragment, to be adapted to the chosen infrastructure:

```nginx
# Inside the HTTPS server block with the actual custom domain and certificate.
root /absolute/path/to/terrene/dist;
location /api/ {
    proxy_pass http://127.0.0.1:3002;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 300s;
}
location / {
    try_files $uri $uri/ /index.html;
}
```

Run FastAPI with `--proxy-headers --forwarded-allow-ips=127.0.0.1` only when that is the actual trusted proxy address. Restrict direct backend access; do not trust arbitrary forwarded headers. Redirect HTTP to HTTPS at the edge. Verify Set-Cookie includes Secure, HttpOnly and SameSite=Strict on the production HTTPS response. The frontend uses same-origin cookies and relative API URLs. No separate-origin CORS changes are needed in this arrangement.

Use a persistent database volume and a backup/retention policy. Configure DATABASE_URL before running `python -m alembic upgrade head`. Apply migrations once before admitting traffic to new workers. Do not create or reset database tables at application startup. Existing migrations are preserved.

Configure HEIGIT_API_KEY only in the backend environment. Keep .env and .env.local ignored. Restrict public Cesium tokens to exact deployed and development origins, minimal permissions and required assets. Public Cesium tokens are visible to visitors. Never add the routing credential to VITE variables.

## Release gate

`npm run check:launch` deliberately fails until `config/launch.json` names the connected HTTPS domain, reviews and workflow verification are confirmed, and legal drafts have been replaced with approved truthful content. Once these are supplied it also verifies HTTPS responses for the app, favicon, legal paths and backend readiness. It never deploys and is not proof of legal compliance.

Before release, independently verify browser rendering at the domain, route all supported modes, generate journeys and itineraries, inspect third-party credits, check guest isolation and persistence across reloads, test failure recovery, and confirm operator identity, contact details, retention, processors and applicable law in reviewed legal pages. No fake reviews, metrics, imagery or success states are used. No Made with AI builder badge exists in application source; provider credits must remain.

The application does not implement accounts, recovery, transit, traffic, historical weather or automatic route optimisation. Public services can fail or limit requests. Published hours and accessibility are not real-time guarantees.
