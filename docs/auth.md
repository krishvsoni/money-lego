# Authentication (Kinde)

Money Lego signs people in with **Kinde**. Money Lego's own **email + password accounts** stay as a fallback. Both resolve to the same `SessionUser`, keyed on our member `_id`, so what a person owns (workflows, runs, connections, PayPal records) never depends on how they signed in.

Issue #7 replaced Clerk.

## Set up Kinde

1. In [Kinde](https://kinde.com), create a business. Then add an application of type **Back-end web** (Next.js).
2. In the application's **Details**, add:

| Setting | Local | Production |
|---|---|---|
| Allowed callback URLs | `http://localhost:3000/api/auth/kinde_callback` | `https://money-lego.vercel.app/api/auth/kinde_callback` |
| Allowed logout redirect URLs | `http://localhost:3000` | `https://money-lego.vercel.app` |

3. Under **Authentication**, turn on the sign-in methods you want (email, Google, ...).
4. Copy the keys into `.env` locally, and into Vercel → Settings → Environment Variables for production, then redeploy:

```bash
KINDE_CLIENT_ID=...
KINDE_CLIENT_SECRET=...
KINDE_ISSUER_URL=https://<your-business>.kinde.com
KINDE_SITE_URL=http://localhost:3000            # production: https://money-lego.vercel.app
KINDE_POST_LOGIN_REDIRECT_URL=/workflows
KINDE_POST_LOGOUT_REDIRECT_URL=http://localhost:3000   # production: https://money-lego.vercel.app
KINDE_POST_LOGIN_ALLOWED_URL_REGEX=^/
```

Without the first four, the app runs with email + password accounts only, and the Kinde buttons are hidden.

## How it works

| Piece | File | What it does |
|---|---|---|
| Sign-in routes | `app/api/auth/[kindeAuth]/route.ts` | Serves only Kinde's `login`, `register`, `logout` and `kinde_callback`, and accepts a post-login redirect only if it's a path on this site |
| Session refresh | `proxy.ts` | Runs Kinde's middleware only for visitors with a Kinde session, to refresh tokens before they expire. Every path is public to it, so it never forces a login |
| Who's signed in | `server/auth/session.ts` | Kinde first (`getUser()` plus the ID token's `email_verified`), then the email + password session cookie |
| Account linking | `server/auth/link-identity.ts` | Pure decision, unit tested (see migration below) |
| Browser | `features/auth/session-context.tsx` | Reads `/api/auth/session` once per page: a name and how they signed in. Never a token |
| Pages | `/sign-in`, `/sign-up` | "Continue with Kinde" first, then the email + password form |

**What stayed the same:**
- Pages still gate on the client.
- Every API still authorizes on the server and answers `401` to signed-out callers.
- Workflow ownership and sharing are untouched.

**Tokens never reach the browser:**
- Kinde keeps them in `httpOnly` cookies.
- Kinde's `setup` route, which returns raw tokens as JSON, is turned off, and Kinde's client SDK isn't used.
- The CSP no longer allows any third-party sign-in scripts. Sign-in is a full-page redirect to Kinde and back.

## Migrating existing accounts

Nothing is copied or moved. Each member keeps its `_id`, and only the key used to find it changes.

**First Kinde sign-in.** When someone signs in with Kinde for the first time and **Kinde has verified their email**, Money Lego looks for an existing member with that address (ignoring case):
- A **Clerk** member (from before Kinde) is linked first, then an **email + password** member.
- The member is re-keyed from `clerk:<id>` or `local:<email>` to `kinde:<id>`. The old key is kept in `previousIdentityKeys`.
- A linked email + password account loses its password. From then on that person signs in with Kinde.
- If nothing matches, a new member is created.

**Safety rules:**
- An **unverified** email never links, because anyone can type someone else's address at sign-up.
- A member already linked to another Kinde user is never taken over.
- Linking is conditional on the member being unchanged, so two simultaneous first sign-ins can't both link it.

**Backfill.** Clerk members are linked lazily, the first time each person signs in with Kinde. To move everyone up front, export users from Clerk and import them into Kinde with the same email addresses (Kinde → Users → Import). Each is linked on their first sign-in.

**Not linked.** A Clerk member who never signs in with Kinde keeps all their data, untouched, and can still be linked later.

**Email + password accounts:** they work exactly as before, at `/sign-in` and `/sign-up`.
