# discobardlogger MVP

MVP app for comparing a selected Warcraft Logs fight against top-performing reference logs.

## Included in this MVP

- Warcraft Logs local auth through the live `joshgotro.com` OAuth bridge
- Client credentials GraphQL service for public report and rankings data
- Report import by report code
- Fight and player source selection
- Benchmark lookup via encounter character rankings
- Side-by-side cast and buff timelines
- Starter insights:
  - cast count deltas (possible missed casts)
  - opener timing drift

## Environment setup

Use `.env.local` with:

```bash
WARCRAFTLOGS_CLIENT_ID=...
WARCRAFTLOGS_CLIENT_SECRET=...
WARCRAFTLOGS_REDIRECT_URI=https://www.joshgotro.com/discobard
DISCOBARD_OAUTH_BRIDGE_API_URL=https://your-backend-api-host.example.com
DISCOBARD_OAUTH_BRIDGE_API_KEY=...
```

### Auth architecture

This app runs locally, but Warcraft Logs OAuth needs a public callback URL. The auth flow is split across two systems:

- `https://www.joshgotro.com/discobard`
  - public callback URL registered with Warcraft Logs
  - browser-visible landing route on your personal site
- `DISCOBARD_OAUTH_BRIDGE_API_URL`
  - backend bridge API host
  - handles `start`, `status`, and `consume` endpoints
  - stores OAuth handoff records and encrypted token payloads
- local `discobardlogger` app
  - starts the bridge flow
  - polls bridge status
  - consumes the finished token into a local session cookie

The backend bridge service must have its own working config, including a valid `ENCRYPTION_KEY` for token storage.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Local OAuth flow

1. Click `Connect Warcraft Logs` in the local app.
2. The local app calls the bridge backend `start` endpoint and opens the returned Warcraft Logs authorize URL.
3. Warcraft Logs redirects back to `https://www.joshgotro.com/discobard`.
4. Your website/bridge backend exchanges the code, stores the token, and marks the handoff as completed.
5. Return to the local app.
6. Click `Check Bridge Status`.
7. Once status is `completed`, click `Finalize Local Connection`.

## Test flow

1. Complete the local OAuth flow above if you need bridge-backed private access.
2. Load a report code in section 1.
3. Pick a fight and player source ID.
4. Set class/spec filters (optional) and find benchmark logs.
5. Select a benchmark row.
6. Run comparison.

## API routes

- `GET /api/auth/warcraftlogs/login`
- `GET /api/auth/warcraftlogs/status`
- `POST /api/auth/warcraftlogs/consume`
- `GET /api/wcl/report?code=...`
- `GET /api/wcl/benchmark?encounterID=...&difficulty=...`
- `POST /api/wcl/compare`

## Notes

- Warcraft Logs ranking payload shapes can vary, so benchmark parsing is defensive.
- `WARCRAFTLOGS_REDIRECT_URI` should stay set to `https://www.joshgotro.com/discobard`.
- `DISCOBARD_OAUTH_BRIDGE_API_URL` should point to the backend bridge host, which may be different from `www.joshgotro.com`.
- The bridge API key is required for start/status/consume calls.
- The bridge backend is expected to encrypt stored tokens; its `ENCRYPTION_KEY` lives on the website/backend service, not in this local app.
