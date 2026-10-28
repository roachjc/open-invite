# QC and production setup

This is the checklist for taking the local preview live. The application still needs hosted persistence, real authentication, and SMS delivery implemented. Adding environment variables alone will not enable those features.

## Environment layout

Use separate resources for QC and production.

- QC has a Vercel project named `open-invite-qc`, a Supabase project named `open-invite-qc`, a Twilio QC subaccount and phone number, and an OpenAI QC project and API key. It contains test people and plans.
- Production has its own Vercel project named `open-invite`, Supabase project named `open-invite-prod`, Twilio production subaccount and phone number, and OpenAI production project and API key. It contains the real circle.
- Local development keeps its SQLite database and fictional circle. Automated browser tests use `.data/e2e` and port 3100. Neither needs access to production.

The two Vercel projects can use the same GitHub repository. Use `qc` as the QC project's deployment branch and `main` as the production project's deployment branch. The current local branch is `master`; rename it when setting up the remote. Disable other deployments in the production Vercel project. If we add pull request previews, they must use QC credentials and have SMS sending disabled.

Each environment gets its own database, auth users and sessions, membership, incoming messages, notification queue, workers, scheduled jobs, SMS credentials, and model key. They share code and versioned schema migrations. Do not copy production contacts, plans, or database snapshots into QC.

Supabase supports separate environments and versioned deployments. Vercel separates deployment environment variables. Using two projects makes the boundary explicit without requiring a custom staging-environment feature. [Supabase deployment](https://supabase.com/docs/guides/deployment), [Vercel environments](https://vercel.com/docs/deployments/environments)

## What Jon needs to provide

### GitHub

- Choose the owning GitHub account or organization and repository name. A private repository is a sensible default.
- Authenticate the local GitHub CLI to the intended account using `gh auth login`. Alternatively, provide repository access through an appropriate connected account and configure Git push access separately.
- The CLI is currently signed out and this checkout has no remote. The connected GitHub plugin identifies as `jroach_fancom`; confirm that this work account is the intended destination before using it.
- Enable repository access for Vercel's GitHub integration and GitHub Actions.

No GitHub token belongs in the application's environment variables. An interactive CLI login and the GitHub integration are enough for normal pushes and deployments.

### Vercel

- Create or choose the Vercel account or team that will own both deployments.
- Sign in locally with the Vercel CLI, or make the two projects in the dashboard and import the repository. Provide access to configure their environment variables and deployment settings.
- Accept the applicable service plan and billing arrangements in your account.
- Use the assigned `vercel.app` addresses initially. If you want a custom domain, provide the domain name and access to its DNS settings. We can use `qc.<domain>` and the production address later.

A Vercel API token is not needed in the application. A deployment token is only needed if we choose CLI-based automation instead of the Git integration.

### Supabase

For each of the QC and production projects, provide:

- Project URL.
- Publishable API key.
- Server-side secret API key.
- Project reference and access to the project's configuration.
- Database connection credentials for applying migrations, or authenticated CLI access and the project database password.

Use the same database region for both projects, preferably near the initial circle and the application's server region. Choose the region once when provisioning.

The publishable key can be used by the browser. The secret key belongs only in server-side configuration and workers. It bypasses row-level permissions, so browser requests must use authenticated users and the publishable key. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)

We will configure phone authentication, the appropriate Twilio sender, site URL, redirect URLs, membership restrictions, and migrations separately in each project. The real circle will be pre-created; the demo identity selector will not authenticate hosted users.

### OpenAI

- An OpenAI API account with billing enabled.
- A QC project with its own API key.
- A production project with its own API key.
- Access to GPT-5.4 mini, or a separately agreed supported extraction model.
- Your chosen spending limits for each project. QC should have a smaller limit.

Only the project API key and model name are needed at runtime. Organization admin keys are not needed. ChatGPT access does not provide this application's API credentials. Configure enforced spending limits if you want requests to stop at a budget; alerts alone only notify. [OpenAI spend limits](https://developers.openai.com/api/docs/guides/spend-limits)

### Twilio

- A Twilio account with billing enabled.
- Separate QC and production subaccounts, each with its own Account SID and Auth Token.
- One live SMS-capable number per environment, with its country code.
- The countries where recipients will receive texts. The initial assumption is US recipients, but this needs confirmation.
- Completion of the sender-registration requirements for the chosen number type and recipient countries. In the US this can mean A2P 10DLC registration or toll-free verification.
- The account owner's identity, business or sole-proprietor information, and billing details entered directly in Twilio when required. These do not belong in the repository or chat.

We will configure the incoming-message webhook, delivery callbacks, opt-out handling, and Supabase phone-auth sender for each environment. Twilio subaccounts separate credentials and senders. Messaging Services will hold the relevant numbers, including the required service setup if we use US A2P 10DLC. [Twilio account layout](https://www.twilio.com/docs/messaging/onboarding/build-your-account), [sender registrations](https://www.twilio.com/docs/trust-hub/registrations)

QC starts with sending disabled. End-to-end SMS testing requires a real QC sender and an allowlist of opted-in testers. Twilio test credentials do not connect to real phones, so they cannot test a real inbound text or phone-verification code. [Twilio test credentials](https://www.twilio.com/docs/iam/test-credentials) Production uses its own sender and real-circle membership.

### People and account choices

- Names and phone numbers for the initial production circle, including country codes.
- Your name and phone number for the first real sign-in.
- A small set of QC testers and their phone numbers for optional real SMS tests.
- Confirmation that members want to receive plan notifications. We can implement the opt-in step; a supplied contact list alone will not start texting people.
- The default time zone for the circle.
- An email address for service alerts and a contact address for support or sender registration.
- Your service budget and willingness to pay for the two environments' resources and phone numbers.

Provide contacts through a private local file or secure entry, not a committed seed file. Sample data can remain in QC; production starts with an empty plan list and the supplied real circle.

## Runtime configuration

Copy `.env.qc.example` and `.env.production.example` only as templates. Populate real values in the matching Vercel project's environment settings and the matching Supabase worker configuration. Keep any local copies ignored by Git.

The intended hosted configuration is:

- `OPEN_INVITE_ENV`: `qc` or `production`. Planned environment identification and guardrails.
- `APP_URL`: the fixed HTTPS address of that environment, used in SMS links and webhook configuration. Planned hosted integration.
- `NEXT_PUBLIC_SUPABASE_URL`: that environment's Supabase URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: that environment's browser-safe publishable key.
- `SUPABASE_SECRET_KEY`: that environment's server-only secret key.
- `OPENAI_API_KEY`: that environment's OpenAI project key. Already used by local extraction when configured.
- `OPENAI_MODEL`: `gpt-5.4-mini` initially. Already supported.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`: that environment's Twilio credentials and sender. The current adapter reads these, but it is not connected to delivery jobs.
- `OPEN_INVITE_LIVE_SMS`: leave `false` during setup. The sender adapter already checks this switch.
- `QC_SMS_ALLOWLIST`: QC tester numbers only. The hosted worker's allowlist enforcement still needs implementation.

Some of these names define the configuration we will wire next. The current app does not switch to hosted storage when they are filled out. Keep `OPEN_INVITE_LOCAL_DEMO` unset on hosted QC and production. It is only an override for local production-build tests and would leave the demo identity switch unauthenticated.

Management credentials are separate from app configuration. For automated migrations, put each database connection URL in the corresponding GitHub Environment's `DATABASE_URL` secret, or use Supabase CLI credentials there. Keep any Supabase account access token, Vercel deployment token, and database management credentials out of browser variables and the app's runtime unless a specific implemented task needs them.

Do not paste secrets into chat. Enter them directly in the service dashboards, ignored local environment files, or a private secret prompt when requested. No real credentials are included in the templates.

## Work still to implement

Once the necessary accounts and credentials exist, I can:

1. Connect the hosted Supabase repository and remove SQLite from hosted requests.
2. Add phone-code sign-in, persistent sessions, real-circle provisioning, and membership checks. Remove access to demo identity switching and reset endpoints in hosted mode.
3. Connect incoming Twilio messages to durable processing, validate signatures against the public webhook URL, deduplicate deliveries, and send the required follow-up questions.
4. Connect notification jobs, status callbacks, retries, opt-out handling, and the QC recipient allowlist. Keep messages tied to the correct environment and plan version.
5. Configure each environment's jobs and auth settings. Ensure QC cannot send through the production number or read the production database.
6. Configure CI checks, migration history, deployments, a QC release path, and an explicitly approved production release. Apply schema changes to QC before production.
7. Run the complete flow with real QC phones, then deploy the tested version to production and import the real circle.
8. Set up failure alerts, production backups and a restore procedure appropriate to the chosen service plans.

Billing, sender identity checks, account ownership, and the initial contact list need your involvement. I can prepare the repository, application code, migrations, deployment configuration, and test procedure.

## When it is finished

A real QC tester can sign in by phone, send a natural-language plan to the QC number, answer a missing-detail question, receive a notification on another tester's phone, follow its link, join, edit, and leave. Changes survive redeployment. No production person or record is affected.

The same tested code runs in production with different credentials, data, sender, and URLs. Real members can perform the same flow. Production exposes no demo identity switch, sample contacts, or reset endpoint. We can identify failed messages, inspect job failures, and recover the production database from a backup.
