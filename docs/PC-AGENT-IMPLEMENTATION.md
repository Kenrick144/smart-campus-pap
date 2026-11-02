# Smart Campus PC Agent — implementation foundation

## Confirmed product decisions

- Supported workstation OS: Windows 11 Pro.
- Sign-in roles: students, teachers and staff.
- Temporary access code: six digits, single-use, expires after **10 minutes**.
- Approved applications to expose in the managed workstation experience: Microsoft Edge, Microsoft Word, Microsoft Excel and Visual Studio Code.
- The administrator and deputy administrator manage device enrollment and policy; they do not need a student access code.

## What this change delivers

1. A server-only Supabase service-role client. The service-role key is never sent to the browser.
2. `POST /api/pc/codes`: authenticated users with an allowed profile can request a one-time code. The API checks the Supabase Auth bearer token, checks the profile in `profiles`, enforces a limit of five codes per user in 15 minutes, stores only a SHA-256 hash and returns the plaintext code once.
3. `POST /api/pc/agent/start`: a workstation agent authenticates with its per-device key and submits its computer UUID plus the six-digit code. The database function validates the device, code expiry, single-use state and active-session constraint in one transaction.
4. `POST /api/pc/agent/end`: the enrolled workstation ends its own active session. The database returns the computer to `Livre`.
5. The migration adds device metadata and the server-managed code/session tables without dropping or renaming existing tables.

## Required environment

Set these values in the deployment environment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (existing browser client)
- `SUPABASE_SERVICE_ROLE_KEY` (**server only; never prefix with NEXT_PUBLIC_**)

## Database rollout

Apply `supabase/migrations/202611020001_pc_agent_foundation.sql` to the existing Supabase project after taking a backup. Do not rerun the legacy `supabase/schema.sql` against an established database.

For each school PC, generate a unique random device key (at least 32 bytes), store the raw key in the Windows Agent's protected local configuration, and store only its lowercase SHA-256 hex digest in `computers.agent_secret_hash`. Do not reuse a key between computers. Restrict database access to administrators/authorized IT staff when enrolling devices.

## Windows agent design (next implementation step)

Build a signed .NET 8 Windows Worker Service and install it as a Windows Service. It should:

- identify itself with the enrolled `computer_id` and device key;
- present a six-digit code at the Windows sign-in/launcher screen and call the start endpoint;
- use Windows account/session controls rather than attempting to replace Windows authentication with a web page;
- launch only the approved applications (Edge, Word, Excel and VS Code) according to the school's Microsoft 365 and software licences;
- send periodic heartbeats and end the server session on sign-out, idle timeout or administrator action;
- keep the device key in Windows-protected storage (DPAPI), never in source code or logs.

The API foundation in this branch is not, by itself, a complete Windows kiosk/lockdown implementation. Enforce application restrictions with Windows policies (Assigned Access/AppLocker/WDAC as appropriate) after testing on a pilot PC. Avoid terminating unrelated processes or locking down school PCs until IT has approved the policy.

## Important integration follow-ups

- Connect the existing Smart Campus code-generation UI to `POST /api/pc/codes`, passing the active Supabase access token.
- Remove the demo `localStorage` code path from production flows.
- Replace the current client-side `changeRole` profile switch with server-authenticated role resolution.
- Rework the generic whole-table delete/reinsert persistence in `app/lib/supabase-data.ts` before enabling concurrent production edits.
- Complete RLS policies for the existing school tables and the five exact roles before production deployment.
- Enroll PCs and provision their individual device-key hashes before agent authentication can succeed.

## Security notes

- Codes are stored as hashes, expire after ten minutes, and are consumed once.
- Device keys are checked by hash; each device must have a different secret.
- Session creation locks the computer and code rows and has a unique partial index preventing two active sessions on the same PC.
- The service-role secret is used only by server route handlers.
- Do not expose the full database error to end users in production; replace it with safe public error codes once the client UI is integrated.
