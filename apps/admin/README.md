# Pothole MTL Admin

This is the local Next.js administrator moderation dashboard for Pothole MTL.

## Local setup

Create the ignored local environment file from the placeholder:

```powershell
Copy-Item .env.example .env.local
```

Set only the public Supabase values:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Then run:

```powershell
npm install
npm run dev
```

Open `http://localhost:3000` and sign in with an approved email/password Auth account.

## Security model

This app contains no service-role key, database password, JWT secret, or direct privileged database access. The browser uses `@supabase/ssr` with only the public Project URL and publishable key.

The browser calls JWT-protected Edge Functions. Those functions authenticate the user, verify active `admin_users` membership server-side, use service-role-only RPCs, and return limited DTOs. Private `report-photos` objects remain private; an authorized detail request receives only short-lived signed URLs, never raw Storage paths.

An Auth account does not become an administrator until a separately approved post-deployment `admin_users` bootstrap row exists. Do not add public signup or a client-side `isAdmin` check.

## Checks

```powershell
npm run typecheck
npm run lint
npm run build
```

Do not deploy this application or change hosted Supabase resources without explicit approval.
