# MakanMana Merchant Desk MVP

Admin URL: https://www.makanmana.app/admin.html

The dashboard reads every full registration and merchant waitlist record from the landing page database. Detail views include every original field, opening hours, structured menu, private media and evidence, workflow history and the existing Control Center sync reference. Private file links expire after ten minutes.

Admin reviews are separate from merchant-supplied data. Notes, follow-up dates and review history persist in the database with optimistic concurrency protection. Marking a merchant ready is allowed only after required data and recorded consents exist. Nothing in this MVP imports, approves or publishes merchants in Control Center.

Traffic collection starts with deployment and respects Do Not Track / Global Privacy Control. Events contain no entered field values. Counts represent browser sessions and measured events, not unique people. Traffic charts cannot reconstruct earlier traffic. The merchant totals are authoritative database registrations independent of visitor analytics.

## Access

The initial password is supplied privately in the project chat, never committed. Change it using the dashboard's password control. Sessions expire after eight hours; password changes revoke all sessions. Logout revokes the current session. Authentication uses a salted PBKDF2 hash and opaque, hashed session tokens. Browser sessions stay in sessionStorage.

Both Edge Functions use verify_jwt=false because they implement their own access controls: merchant-admin validates opaque admin sessions for every protected operation; site-track only accepts validated anonymous analytics writes, has a rate limit, and exposes no reads. No service-role key is included in the browser or repository. All new tables have RLS enabled, with access revoked from anon and authenticated. Privileged RPCs are service-role-only, security invoker.

## Operations

Database migration: merchant_admin_mvp (applied through the connected Supabase migration tool).
Function source: supabase/functions/merchant-admin/index.ts and supabase/functions/site-track/index.ts.
The source SQL file is a copy of the applied migration. Ignore Supabase source files in the static Vercel deployment.

The dashboard refreshes every minute when visible and no editing dialog is open. Merchant filters/search apply to the complete dataset, with table pages of 20 records. CSV exports the filtered set with spreadsheet formula protection.

Unused expired sessions and login attempts are cleaned during successful logins. The session upload list shows the latest 100 draft/finalized/expired upload sessions; full merchant registration and waitlist lists are not limited to 100. Analytics supports 7, 30 or 90 days. Public analytics writes are inherently best-effort and may be blocked by privacy controls or spoofed; they are not an audit trail or proof of a completed registration.
