# Pothole Platform Engineering Guide

## Product and current scope

Pothole MTL is the temporary working name for an iOS-first, Montréal-focused pothole reporting and repair-operations platform. Its eventual workflow is: citizen report → review → crew assignment → repair evidence → visible completion.

Design for future `citizen`, `crew`, and `admin` users. Do not hardcode the product around any individual crew member. A physical pothole and a submitted report are distinct concepts: one pothole may eventually have many reports.

## Current Milestone 10.5 scope

- Preserve the development citizen-report, public-map, nearby-duplicate, administrator authentication, and human moderation paths. AI analysis remains administrator-triggered only; the queue may derive read-only shadow triage from existing persisted assessments.
- Human moderation remains authoritative. AI must not verify/reject a pothole, change `potholes.status` or `report_count`, create `pothole_status_events`, merge duplicates, dispatch work, alter citizen severity, or run automatically.
- Every AI request must pass JWT verification and the existing server-side active `public.admin_users` membership check. Anonymous and authenticated non-admin users must never reach photo selection or the provider.
- Select at most three photos deterministically on the server, prefer representative evidence across citizen reports, and keep `report-photos` private. The browser supplies no Storage path and receives no AI-only URL/path.
- Use the OpenAI Responses API only from the privileged Edge Function, with model/prompt/schema constants, `store: false`, strict Structured Outputs, a bounded timeout, safe error mapping, and server-side output validation. Read only `OPENAI_API_KEY` from the server environment.
- Send only selected image bytes and centralized visual-analysis instructions. Never send citizen/admin identity, coordinates, addresses, notes, submission/upload IDs, Storage paths, tokens, or Supabase credentials.
- Persist each successful result as append-only assessment history with enough versioned metadata for later AI-versus-human calibration. Keep AI history separate from human moderation history and expose only a sanitized latest-assessment DTO through the authorized admin detail boundary.
- Prevent client double submission and use a short server-side per-pothole lease so concurrent requests cannot create duplicate paid calls. Never automatically retry the paid provider request.
- Use the project-local Supabase CLI and keep migrations/functions/tests version controlled. Do not deploy, configure a hosted OpenAI secret, call real OpenAI, mutate hosted data, commit, push, merge, or begin automatic AI triage without explicit authorization.
- Keep automatic analysis, real confidence-driven transitions, auto-verification/rejection, queue-wide jobs, analytics UI, repair/crew work, and every deferred M11 action out of scope.
- Keep paid analysis fail-closed behind server-only `AI_ANALYSIS_ENABLED`; only the exact value `true`, checked after active-admin authorization and before evidence/key/provider access, enables it.
- Treat AI-summary retrieval as supplemental. An AI-only read failure must never suppress core detail, report/photo evidence, human status history, or moderation actions.
- Evaluate future auto-verification only through the pure, versioned shadow policy. `AI_AUTOMATION_ENABLED` defaults off, and no eligibility result may mutate a pothole, report count, or human moderation event.
- Keep technical policy criteria immutable per policy version and independent of runtime operational flags. Replays use persisted assessment data only; environment values may report operational enablement but must not redefine technical eligibility.
- Keep AI operational telemetry minimal, append-only, private, and service-role-RPC-only. Use controlled categories and bounded metadata; never store images, locations, notes, identities, URLs/paths, secrets, raw provider responses/errors, or stacks.
- Treat telemetry writes as best-effort. A telemetry failure must not block AI assessment persistence, core admin detail, or human moderation, and must never fabricate an assessment.
- Derive queue triage through the pure literal-owned `pothole-ai-triage-v1` policy and one bounded service-role-only metadata RPC per page. No queue-view provider calls, private image downloads, lease acquisition, assessment persistence, or telemetry writes are allowed.
- Mark triage stale when report/photo `evidence_recorded_at` (historical NULL fallback: `created_at`) exceeds the assessment request/evidence-selection time. New insert-time defaults use `clock_timestamp()` to cover lock-delayed transactions. Keep timestamp comparison in PostgreSQL at full precision. Never use human status timestamps or automatically refresh AI evidence.
- Keep human status primary and show AI disagreement without reconciliation. Optional triage filters apply only to loaded rows; preserve default human queue filtering, ordering, and pagination.

## Architecture direction

- Mobile: React Native, Expo, TypeScript, Expo Router, Expo FileSystem, and an Expo-compatible Supabase client.
- Admin web: Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth email/password, and `@supabase/ssr` browser/server/proxy session handling.
- Backend: hosted Supabase development project, PostgreSQL/PostGIS, private Storage, Auth, RLS, JWT-verified Edge Functions, and version-controlled migrations.
- AI: a focused server-only OpenAI provider module behind an active-admin Edge Function; no generic AI framework and no browser/mobile provider credential.
- Keep Expo Router route files in `apps/mobile/app`; place non-route application code in `apps/mobile/src`.
- Keep admin route files in `apps/admin/src/app`; place reusable admin code in `apps/admin/src`.
- Keep Supabase project configuration/migrations in `supabase/`, with reusable function validation in `supabase/functions/_shared/`.

## Submission and database rules

- `potholes` represents a physical/canonical road defect. `reports` represents one citizen observation and has a unique, database-enforced `submission_id` idempotency key.
- Use PostGIS `geography(Point, 4326)` as authoritative searchable location data. Human-readable address snapshots help users and operators but do not replace geography.
- A server-generated UUID and `report_upload_intents` bind one user to one private path: `submissions/<user-id>/<submission-id>.jpg`. Do not allow a caller to select an arbitrary Storage path.
- The server performs all direct database and Storage work after validating the user JWT. The phone calls only `prepare-report-upload` and `submit-pothole-report`, then uses the returned signed upload token for that one object.
- Validate external input at both client and server boundaries. JPEGs are limited to 10 MiB; note length is 500 characters; server validation is authoritative.
- The final database RPC must remain atomic, service-role-only, and idempotent. Lock the upload intent before creation and return the existing result on retry. Do not replace it with a broad direct insert policy.
- Use controlled database values for workflow status and report severity. Add enum values only through deliberate migrations.
- Database-generated public IDs must remain concurrency-safe. Gaps are acceptable; fragile application-side numbering is not.
- Store photo metadata in `report_photos`; store actual files only in the private `report-photos` bucket.
- Add only useful indexes: spatial GiST indexes plus the few status, foreign-key, and chronological indexes required for expected queries.
- Migrations must be reviewable and non-destructive. Do not create tables, policies, or bucket configuration only through the dashboard.

## Public map rules

- Preserve default-deny RLS and table privileges for `potholes`, `reports`, `report_photos`, and `report_upload_intents`. Never grant broad mobile `SELECT` access or make the private photo bucket public.
- The public map Edge Function must require a validated user JWT and derive identity only from it. It must not accept a user/reporter ID from the client.
- The PostGIS bbox RPC is service-role-only and returns only a deliberate public DTO: `public_id`, point coordinates, status, formatted address, report count, most-recent report severity, and created timestamp. Never return internal UUIDs, report notes, photo/Storage data, submission IDs, accuracy, or Auth identifiers.
- Use the existing canonical `geography(Point, 4326)` column and GiST index. Query the visible map bbox in PostgreSQL; do not load all potholes or filter them in JavaScript.
- Validate bbox payloads and cap results at the server boundary. Support antimeridian wrapping deliberately if represented by a reversed longitude pair.
- Keep status labels/colors centralized in the mobile app and localize every new citizen-visible map string in English and French.

## Nearby duplicate rules

- Check nearby candidates only when the citizen taps Continue after confirming the location; do not query on every pin drag or map render. A lookup failure must preserve the full draft and offer Retry or Continue without checking.
- Return at most five safe candidate DTOs, sorted nearest first, containing only public ID, coordinates, status, formatted address, report count, latest severity, created time, and distance. Never return reporter identity, submission IDs, notes, accuracy, photo/Storage metadata, or internal UUIDs.
- Use `ST_DWithin` on the canonical PostGIS geography field for a 25 m default candidate search and a server-enforced maximum no greater than 50 m. Reuse the existing GiST index; do not fetch/filter all potholes in JavaScript.
- Keep nearby RPCs and finalizers `SECURITY DEFINER`, `SET search_path = ''`, schema-qualified, and service-role-only. Audit PL/pgSQL output-variable collisions rigorously.
- A changed latitude or longitude invalidates candidates and an existing-pothole choice. Address-only refreshes do not. Reset all nearby state when Done resets the report.
- Use a new versioned finalization RPC for rollout safety. Keep the established v1 finalizer intact until a later deliberate cleanup migration, and deploy the migration before Edge Function code that calls the new version.

## Admin moderation rules

- The admin browser reads only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Never add a service-role key, secret key, database password, JWT secret, or privileged connection string to `apps/admin` or any browser code.
- Use Supabase Auth email/password for `/login`. Do not offer public signup, anonymous admin access, OAuth, email-domain authorization, or a browser-supplied `isAdmin` flag.
- Use the current Supabase SSR browser/server client and session-refresh proxy pattern. Do not treat a local browser session as an authorization decision; Edge JWT validation and `admin_users` membership remain authoritative.
- The browser calls focused `verify_jwt = true` admin Edge Functions only. Those functions validate the real JWT user, reject anonymous/missing-email users, query active membership server-side, and return `403` for non-members.
- `admin_users` and `pothole_status_events` retain RLS/default deny with no browser table policies. Grant the service role only the membership read it needs; keep audit rows append-only through the transition RPC.
- Admin list/detail/transition RPCs must be `SECURITY DEFINER`, use `SET search_path = ''`, schema-qualify every object, alias table columns carefully to avoid PL/pgSQL output-variable ambiguity, revoke `PUBLIC`/`anon`/`authenticated` execution, and grant `EXECUTE` only to `service_role`.
- The Edge Function derives `actor_user_id` from the validated JWT. The browser must never supply it. Invalid or stale transitions return safe domain outcomes and must never overwrite a more recent status.
- Admin DTOs may show canonical data, report evidence, and a sanitized status history. They must not expose reporter Auth IDs, device metadata, `submission_id`, upload intents, raw photo paths, access/refresh tokens, or service-role data.
- Use a coordinate/location panel for this milestone rather than adding a paid web map provider. Display dates in Montréal local time without altering stored UTC timestamps.

## Security and privacy

- Never commit secrets, `.env` files, database passwords, signing credentials, connection strings with passwords, service-role keys, personal access tokens, or JWT signing secrets.
- `OPENAI_API_KEY` is a server-side Edge Function secret only. Never place it in `EXPO_PUBLIC_*`, `NEXT_PUBLIC_*`, browser/mobile code, logs, tests, fixtures, or source control.
- `EXPO_PUBLIC_*` and `NEXT_PUBLIC_*` values are deliberately public build-time values and may contain only the intended Project URL and publishable key. Never expose a service-role credential to Expo or Next.js.
- Keep real environment files ignored. Commit only placeholder examples such as `apps/mobile/.env.example` and `apps/admin/.env.example`.
- All client-accessible application tables must retain RLS. `anon` and `authenticated` must not receive broad direct table or Storage object access.
- Edge Functions must have `verify_jwt = true`, validate `context.supabase.auth.getUser()`, use the server-side client only after that validation, and return minimal generic errors to callers.
- Do not turn a failed/ambiguous upload into an unsafe delete that can race a concurrent finalization. A cleanup attempt must first lock and invalidate a known-unfinalized intent; ambiguous attempts remain retriable. Later add a separately reviewed cleanup policy/job for abandoned intents.
- Request device permissions only when a feature needs them, and avoid collecting unnecessary device metadata.

## Code quality

- Use strict TypeScript, clear types, small understandable modules, and conventional Expo/Next patterns.
- Do not scatter citizen-visible strings through route components. Add English and French copy together for citizen work; the Milestone 9 admin interface may be English-only.
- Add visible progress, empty, error, authorization, confirmation, and pending states when introducing asynchronous behavior. Prevent duplicate mutations while a status transition is in flight.
- Avoid unnecessary dependencies, premature microservices, and large speculative abstractions.
- Run relevant lint, TypeScript, Expo dependency, Next production-build, Edge syntax, migration security, and available Supabase validation checks after implementation.

## Git and workflow

- Inspect repository status before substantial work and preserve unrelated user changes.
- Do not perform destructive Git operations, force-push, delete history, deploy, alter production services, or create paid infrastructure without explicit approval.
- Do not commit `node_modules`, package-manager caches, generated local Expo state, Supabase local state, or real environment files.
- For future remote changes, review `npx supabase db push --dry-run` before `npx supabase db push`, deploy functions only after their migration is live, and regenerate database types with `npx supabase gen types typescript --linked --schema public`.
- Stop at the requested milestone; do not begin the next milestone automatically.
