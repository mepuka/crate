# Frontend Deployment: Firebase Hosting

## Prerequisites
- Firebase project + Hosting site (replace `crate-web` in `.firebaserc`/`firebase.json`).
- `FIREBASE_SERVICE_ACCOUNT` (base64 JSON) or `GOOGLE_APPLICATION_CREDENTIALS` secret in CI.
- Node 20 + pnpm installed locally.

## Build
```bash
pnpm install --frozen-lockfile
cp packages/web/env.production.sample packages/web/.env.production  # edit VITE_API_BASE_URL
pnpm --filter @crate/web build
```
Output: `packages/web/dist`.

## Deploy (local)
```bash
npm i -g firebase-tools
firebase use <project-id>
firebase deploy --only hosting --project <project-id>
```

## CI/CD (GitHub Actions)
- Workflow: `.github/workflows/web-hosting.yml`
- Secrets required:
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_SERVICE_ACCOUNT` (base64-encoded service account JSON with `roles/firebasehosting.admin`)
  - `VITE_API_BASE_URL` (build-time API origin)
- Main branch deploys to live; PRs deploy to preview channels.

## Preview channels
For PRs, the workflow creates `pr-<number>` channel (default 7d). To clean:
```bash
firebase hosting:channel:delete pr-123 --project <project-id>
```

## Rollback
```bash
firebase hosting:rollback --project <project-id>
```

## Smoke test checklist
- Page loads over HTTPS
- Timeline fetches plays (network 200 from API)
- Assets served with cache-control (immutable for assets, no-cache for index.html)
- SPA routes work on reload (Firebase rewrite to /index.html)




