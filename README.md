# SAT SYS — Multi-Tenant POS Portal

## Structure

```
apps/
  portal/            -- Next.js 14 App Router (single deployment, all UI lives here)
packages/
  pos-ui/            -- Reusable brand-agnostic POS components
  supabase-client/   -- Supabase client factory: createClient(url, anonKey)
  gateway-sdk/       -- Typed functions for gateway Supabase queries (server-only)
  ui/                -- Shared design system components (placeholder)
scripts/
  set-user-tenant.ts -- Admin utility to assign a Clerk user a tenant_id + role
```

## Getting Started

1. Copy `.env.example` to `apps/portal/.env.local` and fill in real values.
2. Run `pnpm install`
3. Run `pnpm dev`

## Assigning Users to Tenants (Dev / Admin)

Use the `set-user-tenant.ts` script to manually set a Clerk user's
`publicMetadata.tenant_id` and `publicMetadata.role` for testing.

```bash
# Set user as Owner of Bao-G
pnpm tsx scripts/set-user-tenant.ts user_2abc... 7e928cd7-e593-4955-b031-9aec79ed55d8 owner

# Set user as Staff of Bao-G
pnpm tsx scripts/set-user-tenant.ts user_2abc... 7e928cd7-e593-4955-b031-9aec79ed55d8 staff

# Set user as Super Admin (no tenant binding)
pnpm tsx scripts/set-user-tenant.ts user_2abc... "" super_admin
```

Find your Clerk user ID in the [Clerk Dashboard](https://dashboard.clerk.com)
under **Users**. Find the tenant ID by querying the gateway Supabase `tenants` table:

```sql
SELECT id, slug, brand_name FROM tenants;
```

The script reads `CLERK_SECRET_KEY` from `apps/portal/.env.local` — run it from
the repo root and it will pick it up automatically.

## JWT Template (Supabase RLS)

Before applying `002_role_based_rls.sql`, configure a Clerk JWT template:

1. **Clerk Dashboard** → **JWT Templates** → **New Template** → **Supabase**
2. Template name: `supabase`
3. Claims mapping:

```json
{
  "sub": "{{user.id}}",
  "role": "authenticated",
  "aud": "authenticated",
  "email": "{{user.email_addresses[0].email_address}}",
  "iat": "{{iat}}",
  "exp": "{{exp}}",
  "tenant_role": "{{user.public_metadata.role}}",
  "permissions": "{{user.public_metadata.permissions}}"
}
```

4. In **Supabase Dashboard** → **Authentication** → **Settings**, set the
   JWT secret to your Clerk JWKS URL:
   ```
   https://<your-clerk-domain>.clerk.accounts.dev/.well-known/jwks.json
   ```
   (Replace `<your-clerk-domain>` with your actual Clerk domain, e.g. `sincere-kingfish-72`)

Then run `002_role_based_rls.sql` against each tenant's Supabase project.
