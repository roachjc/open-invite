# Open Invite

Share a ride, ski, run, hike, or library visit with the kids, see what your friends are doing, and join them. Plans have participants and no owner.

## Run locally

Requires Node.js 22.13 or newer and npm. This machine has Node.js 26.

```sh
npm install
npm run dev
```

Open http://localhost:3000. No accounts, API keys, or Docker are required for the local preview. The app seeds six fictional friends and nine upcoming activity plans. All phone numbers are fictional.

The local database lives in `.data/open-invite.sqlite`, which Git ignores. Plans, participation, messages, drafts, and notification previews survive page reloads and server restarts. The sidebar's reset button restores the samples after confirmation.

## Preview from your phone

Run the dev server as above. It listens on all network interfaces. Put the machine's private hostname or Tailscale IP in `.env.local` before opening it from your phone:

```dotenv
OPEN_INVITE_DEV_HOSTS=YOUR_TAILSCALE_IP
```

Then open `http://YOUR_TAILSCALE_IP:3000` while connected to Tailscale. Replace `YOUR_TAILSCALE_IP` with your device's current Tailscale address. Next.js restricts development scripts to known origins, so an unlisted address can show the loading screen without starting the app. List only the hosts you use, separated by commas. Do not add a wildcard.

## Try it

- Browse upcoming plans, plans you're attending, or plans with kids.
- Open a plan and join. All participants can edit it. Leave without cancelling the plan for the others.
- On a plan, use **Text everyone** to open a message draft to the other current participants. Use **Copy numbers** to paste their numbers into your messaging app if the group draft does not open correctly. If clipboard access is unavailable, the numbers appear in a selectable field. These actions use the sample numbers in the local preview. Group drafts need testing on real iPhone and Android devices; existing threads and later participant changes stay under your messaging app's control.
- Share a plan through the form. What, who, where, and when are required.
- Open **Try a text**, send an example, and answer a follow-up if a required detail is missing.
- Switch the preview identity in the desktop sidebar to see other friends' notifications and participation. This switch is a development convenience, not authentication.
- Find sample phone numbers under **Our circle** or on a plan. The app links to your device's SMS application and does not relay conversations.

Without an API key, the text simulator uses a deliberately limited parser. It handles the supplied examples, times such as `tomorrow at noon` and `in 30 minutes`, explicit with-kids or no-kids descriptions, and simple follow-ups. It does not understand arbitrary natural language.

To try real extraction, copy `.env.example` to `.env.local`, set `OPENAI_API_KEY` privately, and restart the server. The server uses GPT-5.4 mini with Structured Outputs. Set `OPENAI_MODEL` to override the configured model. It never sends an SMS. The account can incur API charges when you use the text simulator.

## Product rules

- Plans describe attendees with an `ageGroups` array. Adults are implicit. Plans with children show "With kids"; plans without children have no age badge. The form always includes adults and adds kids when "With kids" is checked. Everyone is welcome to join. Specific ages can go in the optional attendee details. Existing no-kids plans become `["adults"]`, and with-kids plans become `["kids", "adults"]`.
- One circle, shared by everyone. Joining a plan never changes its audience.
- No owner, host badge, approval to join, or response requirement.
- All current participants can edit. Optimistic version checks prevent stale edits from overwriting changes.
- New plans create a notification preview for every other circle member. Joining, leaving, and edits create previews for the other participants.
- Each person can turn text notifications on or off under **Notifications**. The setting defaults to on and persists across restarts. Off suppresses new plan announcements and participant updates, without changing membership or participation. Existing previews remain visible; turning notifications back on does not replay missed notices. Preferences are stored separately from circle contacts so activity filters can be added later.
- Missing end times resolve to midnight following the start date in the plan's time zone, including daylight-saving changes.
- A plan disappears from the active board after it ends. If the last participant leaves, it is withdrawn.
- Original messages and unfinished drafts stay separate from published plans. A follow-up does not publish until the four required fields are present.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

The unit tests cover plan rules, draft conversations, webhook-style replay, and permissions. Hosted schema tests use PGlite, an embedded PostgreSQL, with a small Supabase auth stub. They exercise the actual migration and its row-level policies without Docker. Browser tests run a separate production-preview server on port 3100, using an isolated database in `.data/e2e`. They exercise creation, persistence, shared edits, joining, leaving, notifications, text follow-ups, and mobile layout against that isolated server. They reset only their own sample data.

## Architecture

- `src/app`: Next.js pages and HTTP endpoints.
- `src/components/open-invite.tsx`: browsing, plan details, forms, circle directory, text simulator, and notification previews.
- `src/lib/plans.ts`: validation, end-time rules, and notification descriptions.
- `src/lib/server/database.ts`: local SQLite persistence and plan operations.
- `src/lib/server/extraction.ts`: example parser and optional OpenAI extraction.
- `src/lib/server/messages.ts`: draft follow-ups, per-person serialization, and message deduplication.
- `supabase/migrations`: the hosted PostgreSQL schema, membership policies, and transactional plan mutations.

## What is not connected yet

This is a working local preview. It is not a hosted service ready for real friends' data.

The app still uses local SQLite and development identities. The Supabase migration is prepared and tested, but its hosted adapter, phone authentication, initial-circle import, and durable notification workers are not connected. The Twilio integration has request-validation and guarded sending primitives, but the webhook deliberately returns 503 and nothing dispatches notifications. No live SMS can leave the running preview.

The eventual hosted stack remains Vercel, Supabase, Twilio, and OpenAI. Vercel's ephemeral filesystem cannot host this SQLite database. Connect hosted persistence and authentication before deployment. Provisioning those accounts and registering an SMS sender are separate setup tasks.

Production requests fail closed unless `OPEN_INVITE_LOCAL_DEMO=true` is explicitly set. That flag is only for previewing a production build locally. It provides no authentication and must not be used for a public deployment.

People can coordinate by texting directly. Multiple circles, automatic matching, group chat, bookings, and invitations to join the circle are outside this first version.

## QC and production setup

See [the setup checklist](docs/SETUP.md) for the accounts, credentials, separate resources, and implementation work needed before the service can go live. Use `.env.qc.example` and `.env.production.example` as blank templates. They contain no credentials and do not enable hosted mode on their own.

## Test AI extraction

`Try a text` uses the real API when `OPENAI_API_KEY` is configured. In that conversation, complete drafts publish local plans. Missing activity, location, or time prompts a follow-up. Unspecified age groups default to `["adults"]`; follow-ups retain any age groups already supplied. API failures do not fall back to the example parser.

Under **Try a text → Inspect extraction**, enter a message to see the simulator request, full OpenAI request body with prompt and schema, structured response, response output and token usage, normalized changes, and the resulting plan model. Follow-ups can continue the latest draft. Run history stays in the current inspector session; **Start over** clears it. This mode never publishes plans or creates notifications.

For extraction without publishing through the API, call `POST /api/extract` from the local app origin:

```json
{
  "text": "Mountain biking at Chickadee in 30 minutes for two hours, no kids",
  "draft": {}
}
```

The response contains `parser`, `changes`, the merged `draft`, and `missingFields`. Pass the returned draft back with a follow-up message to continue without saving a plan. Dates resolve against the server's current time in the signed-in person's time zone. Place names remain as supplied; there is no location or activity library yet. This endpoint uses the same local identity and hosted-mode restrictions as the rest of the preview.

Run the opt-in live checks with:

```bash
OPEN_INVITE_LIVE_AI_TEST=true node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/extraction-live.test.ts
```

These checks make paid API requests using synthetic messages and an isolated in-memory database. Routine `npm test` skips them. API calls use `store: false`; the service still receives the message and current draft. The key stays on the server.
