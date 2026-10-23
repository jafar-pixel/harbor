# JL Sports Hub — backend fanart source plugin

This module is backend-only. **No fanart import controls or extra login screens are exposed to viewers.**

## Deployment

Supabase project: JL Vision (`ajbjyjfiglzodbdcdapr`).
Edge function: `jl-sports-fanart-source`.
Database: `public.sports_fanart_sources` (RLS owner-scoped).

The Edge Function is deployed separately from the MediaVision website. Client artwork presentation remains controlled by existing published artwork tables.

## Operations

All operations require a valid **JL Vision Supabase JWT** in `Authorization: Bearer ...`.

- `GET /functions/v1/jl-sports-fanart-source`: list the caller's source records.
- `POST` `{"action":"import_sources","sources":[{"source_url":"https://...","title":"...","slot":"hero","rights_status":"reference"}]}`: add or update reference metadata.
- `POST` `{"action":"pinterest_board","board_id":"1234567890"}`: fetch accessible pins using the official Pinterest v5 board API and store **metadata only**.

The Pinterest connector requires a server-side `PINTEREST_ACCESS_TOKEN` and access to a board owned by or shared with that Pinterest account. Public third-party board pages such as SkullSparks cannot be ingested through this endpoint without authorized API access.

## Security and publishing

- Never put privileged credentials into Vite frontend environment variables.
- The function verifies the caller with Supabase Auth before RLS-protected PostgREST writes.
- All Pinterest imports are tagged `reference`. Sources are **not** automatically approved, downloaded, or published.
- Image rights and source attribution require separate approval before publication.
- Duplicate source URLs are upserted per user.
- Automated scheduling is deliberately **not enabled** until a permitted source board ID, Pinterest authorization, and owner identity are configured.

## Verification status

Supabase reports Edge Function v1 as ACTIVE. Database schema and RLS were previously verified. No signed-in end-to-end sync, approved Pinterest OAuth pull, website build, or website deployment has been verified.
