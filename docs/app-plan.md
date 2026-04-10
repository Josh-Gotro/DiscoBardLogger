# discobardlogger App Plan

## 1. Product Goal

discobardlogger helps World of Warcraft players compare their encounter performance against stronger logs in a way that is easy to understand visually.

Core value:

- Show what happened in the fight over time.
- Show where the player's decisions diverged from high performers.
- Explain likely reasons, not just raw numbers.
- Compare build context such as item level, gear, talents, base stats, and fight conditions.

The product should feel like "fight review with receipts", not just a log browser.

## 2. Primary User Stories

### MVP user stories

- A user signs in with Warcraft Logs.
- A user picks a report and a specific fight from their logs.
- A user selects a reference log or automatically gets matched to top-performing logs for the same boss, difficulty, spec, and similar kill duration.
- The app shows a side-by-side timeline of important actions.
- The app highlights major gaps:
  - cooldown drift
  - missed casts
  - opener differences
  - potion / trinket / major buff timing
  - deaths / downtime / movement gaps
- The app compares summary context:
  - item level
  - key stats
  - talents / loadout if available
  - kill time
  - encounter difficulty

### V2 user stories

- A user gets auto-generated coaching insights.
- A user can compare multiple high performers instead of one.
- A user can save analyses and revisit them.
- A user can share a comparison link.
- A user can track improvement across multiple weeks.

## 3. Recommended Product Shape

The app should have four major surfaces:

1. Landing / onboarding
2. Log import and fight selection
3. Comparison workspace
4. Saved analyses / history

### Comparison workspace sections

- Fight header
  - boss, difficulty, duration, spec, patch if available
- Summary comparison cards
  - DPS/HPS/tank metric
  - item level
  - stat distribution
  - key consumables / buffs
- Timeline view
  - user actions
  - benchmark actions
  - notable fight events
  - aligned markers for pull, phase changes, deaths, heroism/bloodlust, major buffs
- Insight panel
  - biggest timing differences
  - likely rotational losses
  - survivability mistakes
  - uptime gaps
- Filter controls
  - benchmark source
  - percentile band
  - match by duration
  - normalize timestamps

## 4. Recommended Tech Stack

For this project, a full-stack TypeScript app is the most practical choice.

- Frontend: Next.js App Router + React + TypeScript
- Styling: Tailwind CSS plus a chart/timeline visualization layer
- Backend: Next.js server routes or server actions for OAuth, token handling, and GraphQL proxying
- Database: PostgreSQL
- ORM: Prisma or Drizzle
- Background jobs: Inngest, Trigger.dev, or a lightweight queue backed by database jobs
- Cache:
  - Redis for API response caching and quota-aware throttling
  - database for durable saved analyses
- Auth/session for your app:
  - simple session cookie if Warcraft Logs is the only login
  - or Auth.js if you want broader account support later

This app should not call the Warcraft Logs client credentials flow directly from the browser when secrets are involved. The server should own:

- client secret
- token exchange
- quota monitoring
- caching
- request prioritization

## 5. High-Level Architecture

```text
Browser UI
  -> Your app server
    -> OAuth handlers
    -> Warcraft Logs GraphQL service
    -> Comparison engine
    -> Cache layer
    -> Database
      -> Saved users / reports / fights / analyses
    -> Background jobs
      -> refresh benchmark candidates
      -> fetch report metadata
      -> compute derived insights

Your app server
  -> Warcraft Logs OAuth endpoints
  -> Warcraft Logs GraphQL endpoints
```

## 6. OAuth Strategy

Use both flows, but for different purposes.

### Public data

Use the client credentials flow for:

- public rankings
- public character/profile-style lookups
- public reports
- benchmark sourcing

This is ideal for building the benchmark pool.

### Private user data

Use the authorization code flow or PKCE flow for:

- accessing the user's private reports
- letting users compare their own private logs

### Recommendation

Because you already have a client ID, app name, and redirect URL, the cleanest setup is:

- Server-side app with Authorization Code Flow for user sign-in and private log access
- Server-side Client Credentials Flow for public benchmark fetching

That gives you:

- secure client secret handling
- access to both public and private data
- simpler quota control

PKCE is most useful if you later choose a browser-heavy frontend with a separately hosted API or want a pure frontend client. For this app, a server-backed architecture is the better fit.

## 7. Core Application Modules

### 7.1 OAuth module

Responsibilities:

- redirect to Warcraft Logs authorize URL
- handle callback
- exchange code for token
- persist encrypted access token metadata
- refresh or re-auth when needed

Key routes:

- `GET /api/auth/warcraftlogs/login`
- `GET /api/auth/warcraftlogs/callback`
- `POST /api/auth/logout`

### 7.2 Warcraft Logs API client

Responsibilities:

- acquire and cache client credentials tokens
- attach bearer tokens
- expose typed GraphQL query helpers
- append `rateLimitData` to important queries
- retry within reason
- classify cached vs live data

Recommended internal split:

- `oauth-client.ts`
- `graphql-client.ts`
- `queries/`
- `mappers/`

### 7.3 Data ingestion module

Responsibilities:

- fetch report metadata
- fetch fights in a report
- fetch actor/source metadata
- fetch event streams or tables needed for timelines
- normalize raw GraphQL responses into app-friendly models

Output should be your own internal schema, not raw API objects everywhere.

### 7.4 Benchmark selection module

Responsibilities:

- find comparable high-performing logs
- filter by encounter, difficulty, spec, patch/season, kill duration, and optionally item level band
- support one-to-one and one-to-many comparison

Suggested ranking logic for benchmark candidates:

- same boss
- same difficulty
- same spec
- same raid size/context if available
- similar fight duration
- high percentile

### 7.5 Comparison engine

Responsibilities:

- align timelines
- classify actions into windows such as opener, cooldown windows, execute, intermissions
- detect drift and gaps
- compute derived insights

Key derived outputs:

- first cast timing differences
- cooldown usage count differences
- resource overcap windows
- downtime windows
- buff uptime differences
- major mechanic overlap issues

### 7.6 Insight generation layer

This should start rule-based, not LLM-based.

Example rules:

- "Your second major cooldown happened 42s later than the benchmark, causing one fewer usage in the fight."
- "You cast Ability X 7 fewer times despite only 9s more downtime."
- "Your opener omitted Potion / racial / trinket overlap present in the benchmark."

Later you can add optional AI summarization, but only after you trust the derived facts.

### 7.7 Saved analysis module

Responsibilities:

- persist comparison sessions
- re-open without refetching everything
- track user notes
- optionally store versioned insight snapshots

## 8. Suggested Data Model

You do not need every detail from Warcraft Logs in your own database immediately. Store enough to support caching, saved views, and efficient recomputation.

### Tables / entities

- `users`
  - app user record
- `oauth_accounts`
  - Warcraft Logs user linkage
  - token metadata
- `reports`
  - report code
  - owner linkage
  - public/private flag
  - last synced at
- `fights`
  - report id
  - encounter id
  - start/end timestamps
  - difficulty
  - kill/wipe
  - in progress flag
- `actors`
  - fight id or report id
  - source id
  - class/spec/role
  - item level if available
- `fight_events_cache`
  - fight id
  - actor id
  - event payload cache
  - cache status
- `benchmarks`
  - encounter/spec/difficulty bucket
  - source report/fight identifiers
  - summary metrics
- `comparisons`
  - user fight reference
  - benchmark reference
  - computed insight payload
  - created at
- `comparison_timeline_segments`
  - normalized events for efficient rendering

## 9. Caching and Quota Strategy

Your docs already point to the right pattern, and this app should be built around it from day one.

### Cache classes

- Static game data
  - abilities, classes, specs
  - cache effectively forever, version by patch if needed
- Report metadata
  - short TTL for very recent reports
  - long or permanent TTL for old reports
- Fight event data
  - cache indefinitely once fight is complete
- Benchmark lookup results
  - cache for hours to days
- Computed comparison results
  - cache indefinitely unless rules change

### Request priority

- High priority
  - login
  - user-selected fight fetch
  - timeline render requests
- Medium priority
  - benchmark search
  - summary cards
- Low priority
  - background benchmark refreshing
  - historical backfills

### Operational rule

Every important query path should:

1. check cache
2. inspect current quota state
3. decide whether to run now or queue
4. persist result in normalized form

## 10. Frontend Structure

Suggested route map:

- `/`
  - marketing + sign in
- `/dashboard`
  - recent reports, saved analyses
- `/reports`
  - imported reports list
- `/reports/[reportCode]`
  - report details and fights
- `/compare`
  - comparison setup flow
- `/compare/[comparisonId]`
  - saved comparison workspace

Suggested component groups:

- `components/layout`
- `components/charts`
- `components/timeline`
- `components/comparison`
- `components/insights`
- `components/forms`

Important UI patterns:

- synchronized scrolling timelines
- tooltips showing exact timestamp and action
- phase markers
- benchmark filters with visible rationale
- "what matters most" insight callouts above the charts

## 11. Timeline Visualization Plan

This is the heart of the app.

Represent each fight as aligned tracks:

- player casts
- benchmark casts
- major buffs / cooldowns
- encounter events
- downtime / deaths / invalid windows

Design requirements:

- zoomable from full fight to opener window
- color by ability category
- stacked markers when multiple actions happen close together
- hover state with timestamp and ability details
- optional "diff mode" that highlights missing or delayed actions

Normalization ideas:

- align all fights to pull at `t=0`
- optionally align by phase transitions
- optionally normalize by fight length percentage for pattern comparison

## 12. Insight Categories

Start with a small number of trustworthy insights.

- Opener execution
- Cooldown timing
- Ability count differences
- Buff/debuff uptime
- Downtime / inactivity
- Death impact
- Consumable usage
- Gear/stat context

Each insight should include:

- observation
- evidence
- estimated impact or confidence
- comparison context

## 13. MVP Scope

Keep the first version narrow and useful.

### MVP features

- Warcraft Logs OAuth integration
- import a user's reports
- choose a fight and player character
- fetch one benchmark log
- show summary comparison cards
- show two aligned action timelines
- show 3-5 rule-based insights
- save a comparison

### Explicitly defer

- guild-wide dashboards
- AI chat coach
- support for every role/spec edge case
- mobile-first editing workflows
- multi-benchmark statistical overlays
- social features

## 14. Recommended Implementation Phases

### Phase 1: Foundation

- scaffold Next.js app
- set up database and ORM
- add env handling
- implement Warcraft Logs OAuth
- build typed GraphQL client

### Phase 2: Data retrieval

- fetch reports and fights
- fetch actor metadata
- fetch enough event data for one spec/fight comparison
- implement caching and quota logging

### Phase 3: Comparison MVP

- benchmark selection logic
- normalized internal event model
- summary comparison cards
- basic timeline renderer
- first rule-based insights

### Phase 4: Polishing

- saved analyses
- improved filters
- better diff visualization
- background refresh jobs
- error handling and loading states

### Phase 5: Expansion

- broader spec support
- multiple benchmark overlays
- trend analysis over time
- optional AI-generated summaries

## 15. Engineering Risks to Plan Around

- Warcraft Logs GraphQL shape may vary by query type, so keep a mapper layer between API data and UI models.
- Event payloads may be large, so avoid re-fetching them on every page load.
- Benchmark matching can produce misleading comparisons if duration, phase count, or fight strategy differ too much.
- Insight quality will be limited if rules are too generic across all specs. It may be best to support one role/spec deeply first.
- Timeline rendering can get noisy fast. Start with only the most important abilities and allow optional expansion.

## 16. Best First Narrow Slice

If you want the fastest path to a useful product, start with:

- one raid boss
- one role or spec
- one encounter type
- one benchmark comparison at a time

Example:

- compare a single DPS spec on one boss
- analyze opener, cooldown timings, and cast counts

That will let you prove:

- OAuth flow works
- GraphQL queries are sufficient
- timeline UI is understandable
- insight rules are believable

## 17. Suggested Folder Structure

```text
src/
  app/
    api/
      auth/
      warcraftlogs/
      comparisons/
    dashboard/
    reports/
    compare/
  components/
    charts/
    comparison/
    insights/
    timeline/
    ui/
  features/
    auth/
    reports/
    fights/
    benchmarks/
    comparisons/
    insights/
  lib/
    db/
    cache/
    warcraftlogs/
      oauth/
      graphql/
      queries/
      mappers/
    timeline/
    analytics/
  jobs/
  types/
  config/
docs/
  app-plan.md
```

## 18. Immediate Next Steps

1. Scaffold the app with Next.js and TypeScript.
2. Add environment variables for Warcraft Logs OAuth.
3. Implement server-side login and callback routes.
4. Build a minimal GraphQL client with one working query for reports/fights.
5. Decide your first supported use-case:
   - public benchmark lookup only
   - or full private-log comparison from day one
6. Pick one spec/boss slice for the first comparison workflow.

## 19. Recommended Default Decision Set

If you want a solid default direction without overthinking early choices:

- Next.js full-stack app
- PostgreSQL + Prisma
- Redis cache
- Authorization Code Flow for user data
- Client Credentials Flow for public benchmark data
- rule-based insights first
- one-spec MVP before generalization

That structure gives you a strong path from prototype to a real product without painting yourself into a corner.
