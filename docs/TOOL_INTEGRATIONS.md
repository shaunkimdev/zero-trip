# RAGFlow and Airbyte integrations

This document describes the server-side tool boundary used by ZERO TRIP. RAGFlow
supplies grounded candidates; Airbyte keeps the canonical travel data current.
Neither service replaces the deterministic constraints in the trip planner.

```text
Airbyte scheduled sources
  -> main DB staging
  -> validated canonical rows + transactional outbox
  -> versioned RAGFlow documents/chunks

POST /api/trips/plan
  -> RAGFlow retrieval
  -> strict canonical-place adapter
  -> deterministic planTrip(request, acceptedPlaces)
  -> budget/time/opening-hours/walking constrained plan
```

## Runtime configuration

Copy `.env.example` to `.env.local` for local development. Live integrations
require real credentials and IDs; blank variables intentionally keep the
corresponding integration disabled. Store production values in the deployment
platform's secret manager, not in Git.

`VITE_ZERO_TRIP_API_MODE=required` is the normal live setting. It makes a
missing or unreachable backend an explicit error instead of silently changing
the result to demo data. Use `optional` only for an intentionally static demo,
such as the repository's GitHub Pages workflow. This variable is public and
contains no credential. When `optional` is set without a separate API base URL
(an empty value or `/`), the browser skips the API request entirely and uses
the bundled demo catalog. This is important on GitHub Pages, where POST requests
to nonexistent API paths can return an HTML `405` response.

`VITE_ZERO_TRIP_API_BASE_URL` selects the public base URL whose `api/*` routes
reach the standalone server (default `/`). Keep tool origins on HTTPS in live
deployments. Plain HTTP is accepted only for localhost, unless the server-only
escape hatch `ZERO_TRIP_ALLOW_INSECURE_TOOL_HTTP=true` is deliberately set for
an isolated development network.

### Live weather, place, and walking APIs

The following optional server-only keys enrich both the demo catalog and
RAGFlow-backed plans. `ZERO_TRIP_LIVE_API_TIMEOUT_MS` controls each request
(`8000` by default, allowed range `1000..30000`). A failed enrichment never
turns into fabricated data: the planner keeps its validated catalog and adds a
warning or uses its existing walking estimate.

| Variable | Runtime use |
| --- | --- |
| `KMA_SERVICE_KEY` | Calls KMA `getUltraSrtFcst` when the whole itinerary fits its approximately six-hour window, otherwise `getVilageFcst`, for the origin grid. Rain, snow, lightning, strong wind, or extreme temperatures remove outdoor candidates within the official forecast horizon. |
| `TOUR_API_SERVICE_KEY` | Calls TourAPI `KorService2/locationBasedList2` near the origin. Only name-and-500m matches enrich already validated candidates with official address and coordinates; incomplete API rows never become new places. |
| `KAKAO_REST_API_KEY` | Resolves selected place coordinates with Kakao Local and calls Kakao Maps walking routing for the full route. Exact leg times and distances are reapplied to opening-hour, trip-end, and walking-limit validation; an unavailable API falls back to the estimate, while a known constraint violation trims the route or fails closed. |

The KMA and TourAPI public-data keys may be stored in either decoded or
percent-encoded form. The server normalizes them before building the query so
the credential is encoded exactly once.

TourAPI and Kakao location matches are stored separately from each place's
canonical `source`. This preserves the original price/opening-hours provenance
while recording which external record supplied the verified address and
coordinates.

### RAGFlow

`RAGFLOW_BASE_URL`, `RAGFLOW_API_KEY`, `RAGFLOW_DATASET_IDS`, and
`RAGFLOW_ALLOWED_SOURCE_HOSTS` must be set together.

| Variable | Meaning | Default or constraint |
| --- | --- | --- |
| `RAGFLOW_BASE_URL` | RAGFlow server root, with or without `/api/v1` | Required for live retrieval; HTTP(S) URL |
| `RAGFLOW_API_KEY` | RAGFlow API key sent as a Bearer token | Required for live retrieval |
| `RAGFLOW_DATASET_IDS` | Comma-separated dataset IDs searched by ZERO TRIP | At least one ID |
| `RAGFLOW_ALLOWED_SOURCE_HOSTS` | Comma-separated provenance hostname allowlist | At least one hostname; no scheme/path |
| `RAGFLOW_FALLBACK_TO_DEMO` | Explicitly allow a labelled demo plan when retrieval fails or yields no validated place | `false`; keep disabled in production |
| `RAGFLOW_MAX_SOURCE_AGE_DAYS` | Oldest source update accepted at planning time | `30`; integer `1..3650` |
| `RAGFLOW_PAGE_SIZE` | Maximum chunks requested per search | `30`; integer `1..100` |
| `RAGFLOW_SIMILARITY_THRESHOLD` | Minimum accepted RAGFlow similarity | `0.2`; number `0..1` |
| `RAGFLOW_VECTOR_SIMILARITY_WEIGHT` | Vector contribution to hybrid similarity | `0.3`; number `0..1` |
| `RAGFLOW_KNN_TOP_K` | Vector candidates used by RAGFlow | `1024`; integer `1..10000` |
| `RAGFLOW_REQUEST_TIMEOUT_MS` | Per-request timeout | `10000`; integer `1000..60000` |

The client calls `POST /api/v1/retrieval` with hybrid keyword/vector search,
uses `knn_top_k` rather than the deprecated `top_k`, and excludes generated
knowledge-compilation chunks. RAGFlow responses are successful only when both
the HTTP request succeeds and the response envelope has `code: 0`.

### Airbyte

Choose exactly one authentication mode:

- Set `AIRBYTE_ACCESS_TOKEN`, or
- set `AIRBYTE_CLIENT_ID` and `AIRBYTE_CLIENT_SECRET`. `AIRBYTE_TOKEN_URL` is
  optional in this mode.

If both modes are populated, the fixed access token takes precedence.

| Variable | Meaning | Default or constraint |
| --- | --- | --- |
| `AIRBYTE_API_URL` | Airbyte public API root | `https://api.airbyte.com/v1`; HTTP(S) URL |
| `AIRBYTE_ACCESS_TOKEN` | Existing Bearer access token | Alternative to client credentials |
| `AIRBYTE_CLIENT_ID` | Airbyte application client ID | Required with client secret |
| `AIRBYTE_CLIENT_SECRET` | Airbyte application client secret | Required with client ID |
| `AIRBYTE_TOKEN_URL` | OAuth client-credentials token endpoint | `${AIRBYTE_API_URL}/applications/token` |
| `AIRBYTE_MAIN_DB_CONNECTION_IDS` | Comma-separated allowlist for main DB ELT jobs | At least one connection across the two groups |
| `AIRBYTE_RAGFLOW_CONNECTION_IDS` | Comma-separated allowlist for RAG/index jobs | At least one connection across the two groups |
| `AIRBYTE_REQUEST_TIMEOUT_MS` | Per-request timeout | `15000`; integer `1000..60000` |

Airbyte syncs are asynchronous. A successful trigger only returns a job ID;
the rollout is successful only after the job reports `succeeded`. `pending`,
`queued`, `running`, and `incomplete` are non-terminal. `failed` and
`cancelled` are terminal failures.

### Administration token and secret boundary

`ZERO_TRIP_TOOLS_ADMIN_TOKEN` protects every `/api/admin/tools/*` route. Send
it as:

```http
Authorization: Bearer <ZERO_TRIP_TOOLS_ADMIN_TOKEN>
```

The token must contain at least 24 characters. Public trip planning is also
protected per API process by `ZERO_TRIP_PLAN_RATE_LIMIT_PER_MINUTE` (default
`20`) and `ZERO_TRIP_PLAN_MAX_CONCURRENCY` (default `8`). Production gateways
should add their own distributed user/IP quota because in-process counters are
not shared between replicas.

RAGFlow, Airbyte, KMA, Kakao, and TourAPI credentials, connection IDs, and the
administration token are server-only. Do not give any secret a `VITE_` prefix:
Vite intentionally exposes `VITE_*` values to browser bundles. Browser code
must call the ZERO TRIP backend and must never call upstream tools with
credentials directly.

## Server API

### Plan a grounded trip

```http
POST /api/trips/plan
Content-Type: application/json

{"request": { ...TripRequest }}
```

When RAGFlow is configured, the server builds a retrieval query from the trip
request, retrieves chunks, and passes each chunk through the strict canonical
adapter. Only validated `Place` objects reach `planTrip`. Invalid or incomplete
chunks are rejected; the adapter does not invent defaults, infer missing
prices, or repair opening hours. `planTrip` then applies the same deterministic
budget, date, opening-window, fixed-event, walking-distance, and route checks
used for the built-in catalog.

If RAGFlow is completely unconfigured, local development can use the demo
catalog and the response grounding mode is `demo`. A partially configured tool
is `misconfigured`, not a valid demo fallback. Clients should display the
grounding data returned with the plan so demo data cannot be mistaken for live
evidence.

The successful response is `200 OK` with `{ "plan": TripPlan }`. A configured
but unreachable RAGFlow returns an upstream error by default; the server does
not silently replace live evidence with demo places. For local development,
`RAGFLOW_FALLBACK_TO_DEMO=true` explicitly allows a labelled demo response when
retrieval fails or returns no validated places. Keep the default `false` in
production.

The current planner budget covers admission, exhibition, performance, and any
selected cafe or restaurant record. Cafe/restaurant records use the verified
per-person price-range maximum, so a recommendation cannot fit only by using
the cheaper end of a range. Public-transport fares are not yet part of
`planTrip` totals. Walking distance/time is a conservative coordinate-based
estimate rather than a live routing matrix, and the UI states that limitation.

### Inspect tool configuration

```http
GET /api/tools/status
```

This returns the RAGFlow and Airbyte states (`configured`, `disabled`, or
`misconfigured`), non-secret configured counts, and whether the admin API is
configured. It does not return secrets. Use it for readiness diagnostics, not
as a substitute for RAGFlow health or completion of an Airbyte job.

### Trigger an allowlisted Airbyte group

```http
POST /api/admin/tools/airbyte/sync
Authorization: Bearer <ZERO_TRIP_TOOLS_ADMIN_TOKEN>
Content-Type: application/json

{
  "target": "main-db" | "ragflow",
  "connectionId": "optional-allowlisted-connection-id"
}
```

`main-db` selects `AIRBYTE_MAIN_DB_CONNECTION_IDS`, and `ragflow` selects
`AIRBYTE_RAGFLOW_CONNECTION_IDS`. Supplying
`connectionId` narrows the request to that connection; it does not permit an
arbitrary ID outside the configured group allowlist. A valid request returns
`202 Accepted` with `{ "results": [...] }`. Each allowlisted connection has an
independent `started`, `already-running`, or `failed` outcome. A `started`
result includes the Airbyte job to monitor; one failed member does not roll
back another member that started successfully. If every selected connection
fails to start, the endpoint returns `502`; otherwise the asynchronous result
uses `202`.

```http
GET /api/admin/tools/airbyte/jobs/:jobId
Authorization: Bearer <ZERO_TRIP_TOOLS_ADMIN_TOKEN>
```

This endpoint accepts a numeric job ID and returns `{ "job": AirbyteJob }`.
It reads the authoritative Airbyte job state; treat only `succeeded` as a
completed sync. Poll only job IDs returned for the configured allowlisted
connections.

To preserve ordering, there is deliberately no `all` target: trigger
`main-db`, poll every returned job until each is `succeeded`, commit the
canonical/outbox transaction, and only then trigger `ragflow`. If any main DB
job fails or is cancelled, do not start the RAG stage.

These routes provide controlled, on-demand operations. Recurring schedules
belong in each Airbyte Connection (Airbyte UI or API), including timezone/UTC
handling and retry policy. Do not add an application process timer or browser
cron for the same connections.

## Canonical one-place-per-document/chunk contract

Each retrievable RAGFlow chunk must contain exactly one JSON object. Use one
stable place per RAGFlow document and normally one chunk per document so
record-level metadata, updates, and deletes remain unambiguous. Producers
should emit raw JSON; the adapter also tolerates exactly one `json` Markdown
fence. Surrounding commentary, an array, or a second place is rejected. Use one
stable source record per chunk so a price, opening-hours, validity, or deletion
change can be updated without making document-level metadata ambiguous.

```json
{
  "schema_version": "zero-trip.place.v2",
  "id": "seoul-open-data:place:12345",
  "name": "Example Seoul Museum",
  "cluster": "jongno",
  "category": "museum",
  "latitude": 37.572,
  "longitude": 126.979,
  "address": "Seoul, Jongno-gu, ...",
  "summary": "A concise, source-grounded description.",
  "recommended_visit_minutes": 90,
  "price": {
    "kind": "paid",
    "basis": "admission",
    "adult_won": 5000,
    "youth_won": 3000,
    "child_won": 0,
    "minimum_won": null,
    "maximum_won": null,
    "note": "Price observed on the source date"
  },
  "opening_hours": {
    "sun": [{ "open": "10:00", "close": "18:00" }],
    "mon": [],
    "tue": [{ "open": "10:00", "close": "18:00" }],
    "wed": [{ "open": "10:00", "close": "18:00" }],
    "thu": [{ "open": "10:00", "close": "18:00" }],
    "fri": [{ "open": "10:00", "close": "20:00" }],
    "sat": [{ "open": "10:00", "close": "20:00" }]
  },
  "tags": ["history", "indoor"],
  "companions": ["solo", "couple", "children", "parents"],
  "avoid_flags": ["outdoors"],
  "amenities": {
    "wifi": { "available": true, "ssid": "Public WiFi" },
    "restroom": true,
    "accessible": "unknown",
    "pet_friendly": false
  },
  "crowd_level": "medium",
  "source": {
    "name": "Seoul Open Data Plaza",
    "url": "https://data.seoul.go.kr/...",
    "updated_at": "2026-08-29T00:00:00+09:00"
  },
  "availability_note": "Verify exceptional closures before departure"
}
```

For a paid restaurant or cafe, use this price shape instead:

```json
{
  "kind": "paid",
  "basis": "per-person",
  "adult_won": null,
  "youth_won": null,
  "child_won": null,
  "minimum_won": 9000,
  "maximum_won": 13000,
  "note": "One verified meal/menu range per person"
}
```

Optional `event` values use inclusive `start_date` and `end_date` in
`YYYY-MM-DD`, with optional `fixed_start_time` and `requires_reservation`.
Opening hours must include all seven weekday keys; an empty array means closed.
Times use `HH:mm` and may use `24:00` only as the end of a day. Prices are KRW
numbers or explicit `null` when unknown. An admission price uses
`basis: "admission"`, age-specific amounts, and `null` range fields. A paid
cafe or restaurant uses `basis: "per-person"`, `minimum_won` and
`maximum_won`, while its age-specific fields are `null`; the planner budgets
the maximum. Free records explicitly set all five amounts to `0`, and unknown
records set all five to `null`. Unknown prices are never converted to free.
`recommended_visit_minutes` must be a positive integer, opening
windows may not overlap, and coordinates must be numeric, fall within the
adapter's coarse Seoul bounds (`37.4..37.72` latitude and `126.74..127.21`
longitude), and match the tighter bounding envelope of the declared district
cluster. Cluster values cover the 25 district slugs plus the legacy MVP area
aliases; a source must not relabel an out-of-area point. This is an ingestion
sanity check, not a cadastral boundary determination.
`source.updated_at` must be an ISO date or timestamp, and required `source.url`
must use HTTP(S). At planning time its hostname must match
`RAGFLOW_ALLOWED_SOURCE_HOSTS` and its timestamp must pass the configured age
limit; records dated more than 24 hours in the future are also rejected.
`companions` must contain at least one supported
value; enumeration arrays cannot contain duplicates. Boolean-like amenity
fields use the adapter's supported boolean/`unknown` values rather than free
text. Enumeration values must match `src/types/trip.ts`; extend and test that
contract before Airbyte begins emitting a new cluster, category, tag,
companion, or avoidance value.

`schema_version` is required and must currently be `zero-trip.place.v2`; a new
wire shape must use a new version and adapter rather than silently reusing this
contract. The adapter converts this snake-case wire record to the application's
camel-case `Place` model. Invalid chunks are rejected independently. Duplicate
place IDs retain the record with the newest `source.updated_at`; equal
timestamps use retrieval similarity and then chunk ID as deterministic
tie-breakers.

Keep stable identifiers and source provenance in both the canonical main DB
row and the chunk. Recommended RAGFlow document metadata includes
`source_system`, `source_record_id`, `source_url`, `source_updated_at`,
`sync_run_id`, and `active`. RAGFlow metadata can prefilter candidates, but
numeric budget totals and complex opening-time feasibility must still be
verified by `planTrip` against canonical typed values.

## Atomic main DB, outbox, and RAG index rollout

Airbyte freshness and RAG index visibility are different commit points. Use
the following production rollout rather than treating an Airbyte trigger or a
RAGFlow upload response as completion:

1. Airbyte writes source records to main DB staging on its own schedule.
2. A database transaction validates/normalizes rows, updates the canonical
   place tables, and inserts an outbox event containing the source key,
   canonical version, and content hash.
3. An idempotent worker claims the outbox event and writes the one-place JSON
   to a staging/versioned RAGFlow document or dataset. Persist the mapping from
   `(source, stream, source primary key)` to RAGFlow document/chunk IDs.
4. Wait for RAGFlow parsing/indexing to report `DONE`, then verify expected
   counts, hashes, and representative retrieval queries. Upload acceptance is
   not index readiness.
5. Atomically switch the active dataset/version pointer used by retrieval.
   In this implementation that pointer is the server-only
   `RAGFLOW_DATASET_IDS` deployment value; update it and restart/roll the API
   replicas as one release. Returned chunks must carry a matching
   `dataset_id`/`kb_id`, otherwise the manager rejects them. Keep the previous
   known-good version queryable until this step succeeds.
6. Mark the outbox event published only after activation. On failure, retain
   the old index and retry the same idempotent event; never delete the active
   version first.

Deletes use the same outbox path and must remove or disable the corresponding
RAGFlow document/chunk. Deduplicate retrieved versions by stable place ID
during a rollout. The current API routes trigger and inspect Airbyte jobs; the
database transaction, outbox worker, version switch, and reconciliation loop
are deployment responsibilities and are not implied by triggering either
connection group.

## Development, preview, and production hosting

The same tool middleware is available in local Vite development/preview and in
the standalone Node API bundle. `npm run build` creates browser assets in
`dist/` and `server-dist/zero-trip-api.mjs`; run the API with `npm start` after
injecting server environment variables. The API listens on `PORT` or
`ZERO_TRIP_API_PORT` (default `3000`) and `ZERO_TRIP_API_HOST` (default
`0.0.0.0`). Route the frontend's base-relative `/api/...` paths to this
process. `GET /healthz` is the process liveness endpoint.

A static `dist/` deployment, including GitHub Pages, cannot execute tool routes
or safely hold credentials. The Pages workflow therefore explicitly builds
with `VITE_ZERO_TRIP_API_MODE=optional` and remains a labelled demo. A
successful frontend build alone does not prove that RAGFlow or Airbyte is
reachable; production smoke tests must exercise the standalone API too.

Before enabling live traffic, verify:

- `GET /api/tools/status` reports the intended configuration state.
- RAGFlow can reach its embedding/document engine and returns at least one
  canonical chunk for a contract test query.
- The Airbyte service account can access only the configured Connection IDs.
- Admin routes reject missing or incorrect Bearer tokens.
- No secret appears in browser network payloads, generated assets, logs, or a
  variable whose name starts with `VITE_`.

## Official references

The API details below were checked against the current official documentation
on 2026-08-29. Pin and test the deployed versions because both products evolve.

- [RAGFlow v0.27.1 HTTP API reference](https://github.com/infiniflow/ragflow/blob/v0.27.1/docs/references/http_api_reference.md)
- [RAGFlow API key](https://ragflow.io/docs/dev/acquire_ragflow_api_key)
- [RAGFlow dataset and embedding configuration](https://github.com/infiniflow/ragflow/blob/v0.27.1/docs/guides/dataset/configure_knowledge_base.md)
- [RAGFlow metadata management](https://github.com/infiniflow/ragflow/blob/v0.27.1/docs/guides/dataset/manage_metadata.md)
- [Airbyte API authentication](https://reference.airbyte.com/reference/authentication)
- [Airbyte API access tokens](https://docs.airbyte.com/platform/using-airbyte/configuring-api-access)
- [Trigger an Airbyte job](https://reference.airbyte.com/reference/createjob)
- [Read an Airbyte job](https://reference.airbyte.com/reference/getjob)
- [Airbyte job lifecycle](https://docs.airbyte.com/platform/understanding-airbyte/jobs)
- [Update an Airbyte Connection and its schedule](https://reference.airbyte.com/reference/patchconnection)
