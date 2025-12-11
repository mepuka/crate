# Deployment Guide: crate-agent to Google Cloud

## Current Status: ✅ Ready to Deploy

All prerequisites verified:

- ✅ gcloud CLI installed (v543.0.0)
- ✅ Authenticated as: kokokessy@gmail.com
- ✅ Project: gen-lang-client-0874846742
- ✅ Region: us-west1
- ✅ All required APIs enabled

## Quick Start (Cloud Run + Pub/Sub)

1. Configure FAISS + Anthropic env

   ```bash
   # .gcloudrc or your CI/CD secrets
   FAISS_API_URL=https://your-production-faiss-api.com
   FAISS_API_KEY=...
   ANTHROPIC_API_KEY=...
   ```

2. Deploy the Cloud Run service (image build + deploy via Cloud Build)

   ```bash
   cd packages/agent
   ./deploy.sh
   ```

3. Wire the Pub/Sub trigger (run after Cloud Run URL is known)
   ```bash
   PROJECT_ID=your-project \
   REGION=us-west1 \
   SERVICE_NAME=crate-agent \
   SERVICE_URL=https://<cloud-run-url> \
   PUSH_SERVICE_ACCOUNT=pubsub-invoker@your-project.iam.gserviceaccount.com \
   ./packages/agent/scripts/create-pubsub-resources.sh
   ```
   Then set `PUBSUB_INVOKER_EMAIL` in the Cloud Run service env to the same
   `pubsub-invoker@...` account for request verification.

## Deployment Options

**Automated (Recommended):**

```bash
./deploy.sh
```

**Local Test:**

```bash
./deploy.sh local
docker run -e FAISS_API_URL=http://localhost:8000 crate-agent:local
```

## Service Configuration (Cloud Run)

- Project/Region: configurable via `GCP_PROJECT_ID` / `GCP_REGION` (defaults in `.gcloudrc`)
- Memory/CPU: 1Gi / 1 vCPU
- Concurrency: 1 (one enrichment request per instance)
- Scaling: min 0, max 3 (safe default; adjust if backlog grows)
- Auth: `--no-allow-unauthenticated`; only Pub/Sub push SA can invoke
- Env: `FAISS_API_URL`, `FAISS_API_KEY`, `ANTHROPIC_API_KEY`, `PUBSUB_INVOKER_EMAIL`

## Monitoring

View logs:

```bash
gcloud run services logs tail crate-agent --region us-west1
```

Service URL:

```bash
gcloud run services describe crate-agent --region us-west1 --format="value(status.url)"
```

Smoke test with a sample Pub/Sub message:

```bash
PROJECT_ID=<project> \
TOPIC=new-play \
PLAY_IDS="123,456" \
./packages/agent/scripts/publish-sample-new-play.sh
```

## Cost Estimate

~$0.05-0.25 per day with occasional usage (scales to zero when idle)
