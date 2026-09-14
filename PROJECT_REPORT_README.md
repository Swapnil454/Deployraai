# DeployAI Project Report README

This document explains the current project step by step from the real repository structure. It is meant as a handoff report for developers who need to understand what each major app, route, controller, service, and package does.

## 1. Project Summary

DeployAI is a monorepo for an AI-assisted deployment and observability platform.

The platform lets users:

- Sign in with Firebase-backed Google, GitHub, or email authentication.
- Connect GitHub, Vercel, Render, Railway, Netlify, and Cloudflare accounts.
- Analyze GitHub repositories and create deployment projects.
- Deploy frontend, backend, or full-stack services.
- Monitor deployments with health checks, logs, errors, traces, profiles, RUM sessions, topology, SLOs, incidents, and status pages.
- Diagnose issues with AI and create fix pull requests.
- Manage custom domains and provider DNS/domain configuration.
- Use SDKs to send telemetry from user applications.

## 2. Monorepo Layout

```txt
.
+-- client/                 Next.js dashboard application
+-- server/                 Express API, auth, deployment, provider, domain, support logic
+-- packages/
|   +-- analytics-api/      Fastify API for querying observability data
|   +-- ingestor/           Fastify ingestion service for traces, logs, metrics, profiles, RUM
|   +-- ai-agent/           AI diagnosis and GitHub automation service
|   +-- alerting/           Alert evaluator and notification integrations
|   +-- sdk/                JavaScript/TypeScript telemetry SDK
|   +-- sdk-python/         Python telemetry SDK
|   +-- sdk-go/             Go telemetry SDK
|   +-- synthetic-checker/  Synthetic monitor checker
|   +-- build-injector/     Framework detection and build injection helpers
|   +-- shared/             Shared types and auth helpers
+-- infrastructure/         Deployment/infrastructure support files
+-- scripts/                Utility scripts
+-- package.json            Root workspace scripts
+-- package-lock.json       Workspace lockfile
+-- turbo.json              Turbo task definitions
```

## 3. Main Runtime Components

### 3.1 Client

Path: `client/`

The client is a Next.js app. It provides:

- Public pages: landing page, login, signup, public status page.
- User dashboard: projects, deployments, domains, settings, support, workflows.
- Observability UI: traces, logs, errors, topology, profiling, RUM, sessions, dashboards, SLOs, incidents.
- Admin UI: overview, users, deployments, monitors, providers, bug reports, support.

### 3.2 Server

Path: `server/`

The server is an Express API. It handles:

- Auth sessions and JWT cookies.
- Project CRUD and repository analysis.
- Deployment orchestration.
- Provider integrations.
- Custom domains.
- Monitoring and health checks.
- Issues, incidents, SLOs, status pages.
- Support chat and uploads.
- Admin dashboards.
- Proxying observability queries.

### 3.3 Analytics API

Path: `packages/analytics-api/`

Fastify service used to query telemetry data from ClickHouse/Postgres/Redis. It powers traces, metrics, logs, profiles, topology, custom dashboards, billing usage, public status, SLOs, and RUM views.

### 3.4 Ingestor

Path: `packages/ingestor/`

Fastify service that receives telemetry from SDKs and external providers. It ingests traces, logs, metrics, edge spans, profiles, sourcemaps, and RUM events, then writes them into storage.

### 3.5 SDKs

Paths:

- `packages/sdk/`
- `packages/sdk-python/`
- `packages/sdk-go/`

These packages are installed into user applications to capture traces, errors, logs, profiles, RUM events, and web vitals.

## 4. Step-by-Step User Flow

### Step 1: User signs in

Client page:

- `client/app/login/page.tsx`
- `client/app/signup/page.tsx`

Important functions:

- `handleGoogleLogin`: opens Firebase Google popup, gets an ID token, and sends it to the backend.
- `handleGithubLogin`: opens Firebase GitHub popup, requests GitHub scopes, gets an ID token, and sends it to the backend.
- `handleEmailPasswordLogin`: signs in with Firebase email/password, enforces email verification, then sends the ID token to the backend.
- `handleVerifyEmail`: signs in temporarily and sends a verification email.
- `handleFirebaseToken`: posts the Firebase ID token to `/api/auth/firebase-login`, then redirects users by role.

Backend:

- `server/src/controllers/auth.controller.js`

Important functions:

- `firebaseLogin`: verifies Firebase ID tokens with Firebase Admin, finds or creates a Mongo user, creates a Stripe customer for new users, signs a DeployAI JWT, and stores it as an HTTP-only cookie.
- `githubLogin`: legacy OAuth redirect flow for GitHub.
- `githubCallback`: handles legacy GitHub OAuth callback or integration callback, exchanges code for access token, creates/updates user, and creates JWT cookie.
- `me`: returns the authenticated user's profile and integration connection status.
- `logout`: clears the auth cookie.

### Step 2: User connects integrations

Client pages:

- `client/app/dashboard/settings/page.tsx`
- `client/app/dashboard/projects/[id]/deploy/page.tsx`

Backend:

- `server/src/controllers/integration.controller.js`
- `server/src/routes/integration.routes.js`

Important functions:

- `getIntegrationStatus`: returns provider connection status for GitHub, Vercel, Render, Railway, Cloudflare, and others.
- `connectProvider`: starts an OAuth flow for providers that support OAuth.
- `callbackProvider`: handles OAuth callback, stores encrypted tokens, and marks provider connected.
- `connectApiKey`: stores API-key based provider credentials such as Render or Railway.
- `disconnectProvider`: removes or expires a connected provider.
- `getCloudflareZones`: lists Cloudflare zones for the connected Cloudflare account.

Provider services:

- `providers/vercel.service.js`: Vercel API wrapper for projects, deployments, aliases, domains, log drains.
- `providers/render.service.js`: Render API wrapper for services, deploys, env vars, domains, usage, logs.
- `providers/railway.service.js`: Railway GraphQL wrapper for projects, services, variables, deploys, domains, usage, logs.
- `providers/cloudflare.service.js`: Cloudflare API wrapper for zones, DNS records, and token validation.
- `providers/github.service.js`: GitHub repository, branch, file, PR, and commit helpers.

### Step 3: User creates or analyzes a project

Client pages:

- `client/app/dashboard/new-deployment/page.tsx`
- `client/app/dashboard/projects/page.tsx`
- `client/app/dashboard/projects/[id]/configure/page.tsx`

Backend:

- `server/src/controllers/project.controller.js`
- `server/src/routes/project.routes.js`

Important functions:

- `analyzeProject`: reads repository metadata and attempts to detect stack, framework, paths, build commands, start commands, ports, and env requirements.
- `createProject`: creates a Mongo project record, generates a project token, saves repository/provider configuration, and links it to the authenticated user.
- `getProjects`: lists projects for the current user.
- `getProject`: returns one project with ownership checks.
- `updateProjectConfig`: updates deployment config such as framework, paths, commands, env vars, and provider settings.
- `enableAnalytics`: turns on telemetry collection for a project and creates required analytics configuration.
- `disableAnalytics`: turns off project analytics.
- `getAnalyticsSummary`: returns summarized analytics for dashboard display.
- `getProjectUsage`: returns per-project usage metrics.
- `getAiUsage`: returns AI feature usage by project/user.

GitHub helper:

- `server/src/controllers/github.controller.js`

Important functions:

- `getRepos`: lists repositories for the connected GitHub account.
- `getBranches`: lists branches for a selected repository.

### Step 4: User deploys frontend, backend, or full stack

Client pages:

- `client/app/dashboard/projects/[id]/deploy/page.tsx`
- `client/app/dashboard/deployments/[id]/page.tsx`
- `client/app/dashboard/deployments/frontend/page.tsx`
- `client/app/dashboard/deployments/backend/page.tsx`
- `client/app/dashboard/deployments/fullstack/page.tsx`

Backend:

- `server/src/controllers/deployment.controller.js`
- `server/src/services/deployment.service.js`
- `server/src/services/deploymentProvider.service.js`

Important controller functions:

- `triggerFrontendDeployment`: validates project ownership/config and creates or starts a frontend deployment.
- `triggerBackendDeployment`: validates project ownership/config and creates or starts a backend deployment.
- `triggerFullDeployment`: creates coordinated frontend and backend deployments under one orchestration group.
- `getDeployment`: returns a single deployment, enriched with provider state and related metadata.
- `getUserDeployments`: lists deployments across all user projects.
- `getProjectDeployments`: lists deployments for a specific project.
- `syncDeployment`: checks the provider for latest status and updates the local deployment record.
- `explainDeploymentError`: uses logs and AI helpers to summarize why a deployment failed.
- `retryDeployment`: requeues or retriggers a failed deployment.
- `rollbackDeployment`: triggers provider rollback when supported.
- `deleteDeployment`: deletes or detaches deployment records.

Important service functions:

- `triggerFrontendService`: creates or triggers the frontend provider deployment.
- `triggerBackendService`: creates or triggers the backend provider deployment.
- `createQueuedFrontendDeployment`: creates a pending frontend deployment record that can be picked up later.
- `startFrontendProviderDeployment`: calls the selected provider API to create/update/deploy frontend service.
- `startBackendProviderDeployment`: calls the selected provider API to create/update/deploy backend service.
- `checkFrontendProviderStatus`: polls provider state and updates frontend deployment status.
- `checkBackendProviderStatus`: polls provider state and updates backend deployment status.
- `appendLog`: stores deployment logs in the deployment document.
- `createLog`: creates structured deployment log entries.

### Step 5: Health checks and monitoring run

Backend:

- `server/src/services/healthCheck.service.js`
- `server/src/services/monitoring.service.js`
- `server/src/controllers/monitoring.controller.js`

Important health functions:

- `checkUrl`: performs retrying HTTP health checks with timeout.
- `checkBackendHealth`: checks backend endpoint health and logs results.
- `checkFrontendHealth`: checks frontend endpoint health and logs results.
- `checkCors`: checks whether frontend can call backend without CORS failure.

Important monitoring functions:

- `createDefaultMonitors`: creates default uptime monitors for frontend/backend URLs.
- `runMonitorCheck`: runs one monitor, records response time/status, and sends alerts on state changes.
- `runProjectMonitors`: runs all monitors for a project.
- `runAllMonitors`: cron entry point to run monitors globally.

Important controller functions:

- `createMonitors`: creates monitors for a project.
- `getProjectMonitors`: lists project monitors.
- `getMonitor`: returns one monitor.
- `checkMonitorNow`: manually runs a monitor.
- `pauseMonitor`: pauses a monitor.
- `resumeMonitor`: resumes a monitor.
- `getProjectMonitorSummary`: returns dashboard-friendly monitor summary.

### Step 6: Observability data is collected

SDK:

- `packages/sdk/src/index.ts`

Exported SDK functions:

- `initTracer`: initializes tracing configuration.
- `flushTraces`: flushes buffered telemetry to the ingestor.
- `setupGlobalErrorCapture`: captures unhandled errors/rejections.
- `withSpan`: wraps async work in a trace span.
- `track`: records custom events.
- `captureError`: records an exception/error event.
- `getConfig`: returns current SDK config.
- `ContinuousProfiler`: starts/stops profiling.

Ingestor routes:

- `packages/ingestor/src/routes/traces.ts`: receives span/trace payloads.
- `packages/ingestor/src/routes/logs.ts`: receives logs and provider log drains.
- `packages/ingestor/src/routes/metrics.ts`: receives metrics.
- `packages/ingestor/src/routes/profiles.ts`: receives CPU/profile data.
- `packages/ingestor/src/routes/rum.ts`: receives browser RUM events.
- `packages/ingestor/src/routes/sourcemaps.ts`: receives sourcemaps for deobfuscation.
- `packages/ingestor/src/routes/edge-spans.ts`: receives edge runtime spans.

Ingestor writers:

- `writers/spans.ts`: writes spans to ClickHouse.
- `writers/logs.ts`: writes logs to ClickHouse.
- `writers/metrics.ts`: writes metrics to ClickHouse.

Supporting ingestor services:

- `issueService.ts`: groups telemetry into issues.
- `alertEvaluator.ts`: evaluates alert rules.
- `alertDispatcher.ts`: sends alert notifications.
- `logParser.ts`: parses provider logs and maps them to projects.
- `usage-check.ts`: enforces project usage limits.

### Step 7: Observability UI queries analytics

Client pages:

- `client/app/dashboard/[projectId]/overview/page.tsx`
- `client/app/dashboard/[projectId]/traces/page.tsx`
- `client/app/dashboard/[projectId]/errors/page.tsx`
- `client/app/dashboard/observability/logs/[projectId]/page.tsx`
- `client/app/dashboard/observability/topology/[projectId]/page.tsx`
- `client/app/dashboard/observability/profiling/[projectId]/page.tsx`
- `client/app/dashboard/observability/rum/[projectId]/page.tsx`
- `client/app/dashboard/observability/sessions/[projectId]/page.tsx`
- `client/app/dashboard/observability/dashboards/[projectId]/page.tsx`

Analytics API route modules:

- `metrics.ts`: overview metrics, timeseries, route metrics, latency/error summaries.
- `traces.ts`: trace search and trace details.
- `traces-analysis.ts`: trace analysis and AI-style summaries.
- `traces-histogram.ts`: trace duration distributions.
- `traces-rum.ts`: RUM-related traces and web vitals.
- `logs.ts`: log search and filters.
- `logs-stream.ts`: live logs via SSE.
- `profiles.ts`: profile queries and flamegraph data.
- `topology.ts`: service dependency topology.
- `custom-dashboards.ts`: user-defined dashboard layout and widget queries.
- `custom-queries.ts`: custom query execution.
- `infrastructure.ts`: infrastructure metrics.
- `billing.ts`: usage and billing metrics.
- `slo.ts`: SLO status and burn-rate data.
- `issues.ts`: issue analytics.
- `public-status.ts` and `status.ts`: public status page data.

### Step 8: Issues are diagnosed and fix PRs are created

Backend:

- `server/src/controllers/issue.controller.js`
- `server/src/controllers/issueFix.controller.js`
- `server/src/controllers/fixPr.controller.js`
- `server/src/services/ai.service.js`

Important issue functions:

- `getIssues`: lists grouped issues for a project.
- `getIssue`: returns one issue.
- `updateIssueStatus`: updates issue status.
- `updateIssueAssignee`: assigns an issue.
- `getIssueComments`: lists comments.
- `createIssueComment`: adds a comment.
- `ignoreIssue`: marks issue ignored.
- `resolveIssue`: marks issue resolved.
- `diagnoseIssue`: calls AI diagnosis logic and stores the result.
- `getIssueDiagnosis`: retrieves stored diagnosis.

Important AI/fix functions:

- `generateIssueDiagnosis`: creates a diagnosis from issue and latest telemetry event.
- `createIssueFixPr`: creates a PR for an issue-specific fix.
- `createFixPr`: creates a fix PR from deployment failure analysis.
- `patchHealthRoute`: local helper that adds or fixes health route code.
- `patchCors`: local helper that patches CORS configuration.
- `patchPortBinding`: local helper that fixes app port binding.
- `updateEnvExample`: local helper that updates `.env.example`.
- `getFixPr`: returns one fix PR record.
- `listProjectFixPrs`: lists project fix PRs.

### Step 9: Domains are added and verified

Client:

- `client/app/dashboard/domains/page.tsx`
- `client/app/dashboard/domains/[id]/analytics/page.tsx`

Backend:

- `server/src/controllers/domain.controller.js`
- `server/src/routes/domain.routes.js`

Important functions:

- `addCustomDomain`: creates a domain setup record, validates ownership/project/provider, and starts provider domain setup.
- `getProjectDomains`: lists domains for a project.
- `getAllDomains`: lists all user domains.
- `getDomain`: returns one domain setup.
- `verifyDomainLogic`: checks DNS/provider verification status and updates local state.
- `verifyDomain`: HTTP handler that calls verification logic.
- `updateDomain`: updates domain settings.
- `deleteDomain`: removes provider domain and local record.
- `makePrimary`: marks a domain as primary for a project/service.
- `redirectToPrimary`: configures provider redirect to the primary domain.
- `disableRedirect`: removes redirect configuration.
- `checkDomainHealth`: checks DNS, provider status, SSL, and live response.
- `applyCloudflareDns`: creates required DNS records in Cloudflare.
- `getDomainActivity`: returns audit/activity log for a domain.
- `logDomainActivity`: internal helper that stores domain action history.
- `assertNotPrivateIp`: SSRF protection helper for domain checks.

### Step 10: SLOs, incidents, and status pages are managed

Backend:

- `server/src/controllers/slo.controller.js`
- `server/src/controllers/incident.controller.js`
- `server/src/controllers/status.controller.js`
- `server/src/controllers/statusComponent.controller.js`

SLO functions:

- `getStatusPageConfig`: returns project status page settings.
- `updateStatusPageConfig`: updates status page settings.
- `getSLOs`: lists SLO definitions.
- `createSLO`: creates an SLO.
- `deleteSLO`: deletes an SLO.
- `getSLOStatus`: calculates current SLO status.

Incident functions:

- `getIncidents`: lists incidents.
- `createIncident`: creates an incident.
- `getIncidentById`: returns incident details.
- `updateIncidentStatus`: changes status.
- `getIncidentUpdates`: lists updates for an incident.

Status page functions:

- `getPublicStatus`: returns public-facing status page data.
- `getUptimeHistory`: returns uptime history for public display.
- `getCached` and `setCache`: internal short-lived cache helpers.
- `getStatusConfig`: internal helper that resolves status page by identifier.

Status component functions:

- `getComponents`: lists status components.
- `createComponent`: creates a component.
- `updateComponent`: updates a component.
- `deleteComponent`: deletes a component.

### Step 11: Support and admin tools

Support:

- `server/src/routes/support.routes.js`
- `client/components/support/SupportChat.tsx`

Support routes handle:

- File uploads.
- Listing support cases.
- Opening one case.
- Creating AI or human support cases.
- Adding follow-up messages.
- Real-time chat updates over Socket.IO.
- Admin case listing and status updates.

Admin:

- `server/src/controllers/admin.controller.js`
- `server/src/routes/admin.routes.js`

Important functions:

- `getOverviewMetrics`: returns counts and aggregate platform metrics.
- `getUsers`: lists users for admin view.
- `getDeployments`: lists platform deployments.
- `getBugReports`: lists bug reports.
- `updateBugReportStatus`: changes report status.
- `getMonitors`: lists monitors globally.
- `getProvidersSummary`: summarizes connected provider counts.

## 5. Server Route Map

Routes are mounted in `server/src/app.js`.

```txt
/auth                         Legacy OAuth auth routes
/api/auth                     Session auth routes
/api/github                   GitHub repo/branch routes
/api/projects                 Project, analytics, deployment listing routes
/api/integrations             Provider OAuth/API-key routes
/api/deployments              Deployment actions and status routes
/api/fix-prs                  Fix PR lookup routes
/api/domains                  Domain management routes
/api/admin                    Admin-only routes
/api/projects/:id/workflows   Workflow routes
/api/support                  Support routes
/api/observability            Proxy to analytics API
/api/public/status            Public status page routes
/api/internal                 Internal service routes
/api/analytics                Public analytics/injector routes
/health                       Server health endpoint
```

## 6. Client Page Map

```txt
/                              Landing page
/login                         Login
/signup                        Signup
/dashboard                     Main dashboard
/dashboard/projects            Project list
/dashboard/new-deployment      Create deployment/project
/dashboard/projects/[id]/*     Project deploy/config/monitoring pages
/dashboard/deployments/*       Deployment lists and details
/dashboard/domains             Custom domains
/dashboard/issues              Issues
/dashboard/incidents           Incidents
/dashboard/slos                SLOs
/dashboard/status-pages        Status pages
/dashboard/observability/*     Logs, traces, topology, profiling, RUM, sessions, dashboards
/dashboard/settings            Integrations/settings
/dashboard/support             Support
/dashboard/workflows           Workflow runs
/admin/*                       Admin dashboard
/status/[projectId]            Public status page
```

## 7. Data Models

Key Mongo models in `server/src/models/`:

- `User`: account profile, role, auth providers, encrypted provider tokens, connected state.
- `Project`: repository/provider/deployment/analytics/status-page configuration.
- `Deployment`: deployment lifecycle, provider IDs, logs, URLs, status, snapshots.
- `ConnectedAccount`: provider tokens and account metadata.
- `DomainSetup`: custom domain config, DNS/provider status, primary/redirect flags.
- `DomainActivityLog`: domain audit history.
- `Monitor`: uptime monitor definition.
- `MonitorCheck`: monitor check result history.
- `FixPullRequest`: AI-created fix PR metadata.
- `WorkflowRun`: workflow run state and logs.
- `HumanSupportCase` and `AISupportCase`: support case data.
- `PlatformBugReport`: platform bug reports.
- `AiUsage`: AI usage tracking.
- `AnalyticsEvent`: analytics event metadata.

## 8. Background Jobs and Workflows

Files:

- `server/src/cron.js`
- `server/src/workflows/index.js`
- `server/src/workflows/deployment.workflow.js`

Responsibilities:

- Register deployment workflows.
- Run scheduled monitor checks.
- Run provider status polling.
- Keep deployment and domain status updated.
- Dispatch alerts when checks fail.

Workflow routes:

- `GET /api/projects/:projectId/workflows`: list workflow runs.
- `POST /api/projects/:projectId/workflows/:name/trigger`: trigger a workflow.
- `POST /api/projects/:projectId/workflows/:runId/cancel`: cancel a run.
- `POST /api/projects/:projectId/workflows/:runId/retry`: retry a run.

## 9. Security Controls

Auth and protection:

- `requireAuth`: validates JWT cookie and attaches `req.user`.
- `requireAdmin`: restricts admin routes.
- `verifyProjectOwnership`: prevents cross-project access.
- `requireOrigin`: CSRF/origin check for API routes.
- HTTP-only auth cookie for backend session.
- Provider tokens encrypted before storage.

Network safety:

- `/api/proxy-health` rejects private/reserved IPs to reduce SSRF risk.
- Domain verification rejects private IP targets.
- Analytics ingestion uses project tokens/secrets.

Build/deployment safety:

- Vercel build uses `client/vercel.json`.
- Linux native CSS packages are pinned as optional dependencies so Vercel can build Tailwind/Lightning CSS reliably.
- Google font network dependency was removed from build-time font loading.
- Firebase auth initialization is lazy so static prerender does not crash when Vercel lacks `.env.local`.

## 10. Environment Variables

### Client

```txt
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_ANALYTICS_API_URL
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

### Server

```txt
PORT
NODE_ENV
FRONTEND_URL
BACKEND_URL
JWT_SECRET
JWT_EXPIRES_IN
COOKIE_NAME
MONGO_URI
DATABASE_URL
REDIS_URL
SERVER_SECRET_KEY
INGESTOR_JWT_SECRET
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
GITHUB_CALLBACK_URL
VERCEL_CLIENT_ID
VERCEL_CLIENT_SECRET
VERCEL_CALLBACK_URL
RAILWAY_API_TOKEN
RAILWAY_WEBHOOK_SECRET
RENDER_API_URL
AI_PROVIDER
GEMINI_API_KEY
OPENAI_API_KEY
RESEND_API_KEY
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
STRIPE_PRICE_ID
CREDENTIAL_ENCRYPTION_KEY
```

### Observability services

```txt
ANALYTICS_API_URL
AI_AGENT_URL
INGESTOR_URL
CLICKHOUSE_URL
POSTGRES_URL or DATABASE_URL
REDIS_URL
```

## 11. Local Development

Install dependencies:

```bash
npm install
```

Run everything through Turbo:

```bash
npm run dev
```

Run the client:

```bash
npm run dev --workspace client
```

Run the server:

```bash
npm run dev --workspace server
```

Build the client:

```bash
npm run build --workspace client
```

Run the Vercel-style client build:

```bash
npx turbo run build --filter=client
```

## 12. Deployment Notes

Client Vercel config:

```json
{
  "buildCommand": "cd .. && npx turbo run build --filter=client",
  "outputDirectory": ".next",
  "framework": "nextjs"
}
```

Important Vercel notes:

- Build branch should match the pushed branch, currently `feature/observability`.
- Set all required `NEXT_PUBLIC_*` env vars for runtime auth and API calls.
- The lockfile includes Linux native packages needed by Tailwind/Lightning CSS:
  - `@tailwindcss/oxide-linux-x64-gnu`
  - `lightningcss-linux-x64-gnu`

## 13. Main End-to-End Flow

```txt
User logs in
  -> Firebase creates identity
  -> Server verifies Firebase token
  -> Server creates JWT cookie
  -> User connects GitHub/provider accounts
  -> User selects GitHub repo
  -> Server analyzes repository
  -> User creates project
  -> User configures build/start/env/provider settings
  -> User triggers deployment
  -> Server creates deployment record
  -> Provider service creates/updates provider project
  -> Provider deployment starts
  -> Server polls provider status
  -> Health checks run
  -> Monitors are created
  -> SDK sends telemetry to ingestor
  -> Analytics API serves dashboard queries
  -> Issues/alerts/incidents are created from telemetry
  -> AI diagnosis can create fix PRs
  -> Status page shows public uptime/incident state
```

## 14. What To Improve Next

- Normalize all `NEXT_PUBLIC_API_URL` usage behind a client API helper.
- Clean malformed repeated template strings in some admin fetch calls.
- Add route-level API documentation generated from Express/Fastify route definitions.
- Add integration tests for auth, deployment trigger, project ownership, and domain verification.
- Add Linux CI build so native optional dependency problems are caught before Vercel.
- Add OpenAPI documentation for server routes.
- Split large controllers such as `domain.controller.js` and `deployment.controller.js` into smaller service modules.
- Add stricter TypeScript to server or migrate controllers gradually.
- Add structured logging and request IDs across services.
