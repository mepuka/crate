# Crate Infrastructure Runbook

**Last Updated:** 2025-12-19
**Project ID:** `gen-lang-client-0874846742`

---

## Overview

This document provides operational details for the Crate infrastructure, including authentication requirements, troubleshooting guides, and configuration details.

---

## GCP Resources

### Project Configuration

| Setting | Value |
|---------|-------|
| Project ID | `gen-lang-client-0874846742` |
| Project Name | PureDialog (shared project) |
| Region | `us-west1` |

### Cloud Run: crate-agent

| Setting | Value |
|---------|-------|
| Service Name | `crate-agent` |
| URL | `https://crate-agent-cjatp5myqa-uw.a.run.app` |
| Region | `us-west1` |
| Min Instances | 1 |
| Max Instances | 8 |
| Image | `gcr.io/gen-lang-client-0874846742/crate-agent:latest` |

**Endpoints:**
- `GET /health` - Health check
- `POST /enrich-batch` - Batch enrichment (used by scheduler)
- `POST /pubsub` - PubSub push endpoint (used by new-plays subscription)

**Environment Variables:**
| Variable | Value/Source |
|----------|--------------|
| `FAISS_API_URL` | `https://cratemusic.duckdns.org` |
| `FAISS_API_KEY` | `placeholder` |
| `ANTHROPIC_API_KEY` | Secret: `ANTHROPIC_API_KEY` |
| `GOOGLE_AI_API_KEY` | Secret: `gemini-api-key` |

### Cloud Scheduler: enrich-unprocessed

| Setting | Value |
|---------|-------|
| Job Name | `enrich-unprocessed` |
| Schedule | `0 * * * *` (hourly) |
| Target URL | `https://crate-agent-cjatp5myqa-uw.a.run.app/enrich-batch?limit=10&strategy=newest_first` |
| Service Account | `scheduler-invoker@gen-lang-client-0874846742.iam.gserviceaccount.com` |
| Auth Type | OIDC Token |

### Pub/Sub: new-plays

**Topic:** `projects/gen-lang-client-0874846742/topics/new-plays`

**Subscription:** `new-plays-to-agent`
| Setting | Value |
|---------|-------|
| Type | Push |
| Push Endpoint | `https://crate-agent-cjatp5myqa-uw.a.run.app/pubsub` |
| Service Account | `scheduler-invoker@gen-lang-client-0874846742.iam.gserviceaccount.com` |
| Auth Type | OIDC Token |
| Audience | `https://crate-agent-cjatp5myqa-uw.a.run.app` |
| Ack Deadline | 300s |
| Retry Min | 10s |
| Retry Max | 600s |

---

## Authentication Architecture

### Service Accounts

| Service Account | Purpose |
|-----------------|---------|
| `scheduler-invoker@gen-lang-client-0874846742.iam.gserviceaccount.com` | Invokes crate-agent via Scheduler and PubSub |
| `211636922435-compute@developer.gserviceaccount.com` | Compute Engine default (Cloud Build) |
| `service-211636922435@gcp-sa-pubsub.iam.gserviceaccount.com` | GCP-managed Pub/Sub service agent |

### IAM Bindings

**crate-agent Cloud Run Service:**
```
roles/run.invoker:
  - serviceAccount:scheduler-invoker@gen-lang-client-0874846742.iam.gserviceaccount.com
  - serviceAccount:211636922435-compute@developer.gserviceaccount.com
```

**scheduler-invoker Service Account:**
```
roles/iam.serviceAccountTokenCreator:
  - serviceAccount:service-211636922435@gcp-sa-pubsub.iam.gserviceaccount.com
```

This binding allows the Pub/Sub service agent to create OIDC tokens impersonating the scheduler-invoker account for authenticated push delivery.

---

## Digital Ocean Droplet

### Connection

```bash
ssh root@cratemusic.duckdns.org
# or
ssh root@157.230.188.136
```

### Docker Services

Located at `/root/crate/faiss-search-api/`

```bash
docker compose ps
```

| Service | Purpose | Port |
|---------|---------|------|
| kexp-search-api | FastAPI app (FAISS, timeline, search) | 8000 |
| datasette | SQLite browser | 8001 |
| caddy | Reverse proxy (HTTPS) | 80, 443 |

### Shared Database

Path: `/root/crate/faiss-search-api/data/music_kb.sqlite`

This database is mounted by both `kexp-search-api` and `datasette` containers.

**Tables:**
- `plays` - KEXP play history
- `insights` - AI-generated insights
- `links` - Streaming links, external resources
- `generated_assets` - Visual assets

### Cron Jobs

```bash
crontab -l
```

| Schedule | Job |
|----------|-----|
| `*/30 * * * *` | Sync KEXP plays |

---

## Troubleshooting

### PubSub Push Returning 403

**Symptoms:**
- `/pubsub` endpoint returns 403
- Logs show "The request was not authenticated"

**Root Cause:**
Cloud Run rejects requests because the OIDC token validation fails.

**Checklist:**

1. **Verify PubSub subscription uses OIDC:**
   ```bash
   gcloud pubsub subscriptions describe new-plays-to-agent \
     --project=gen-lang-client-0874846742 \
     --format="yaml(pushConfig.oidcToken)"
   ```

2. **Verify service account has run.invoker:**
   ```bash
   gcloud run services get-iam-policy crate-agent \
     --region=us-west1 \
     --project=gen-lang-client-0874846742
   ```

3. **Verify Pub/Sub can create tokens (CRITICAL):**
   ```bash
   gcloud iam service-accounts get-iam-policy \
     scheduler-invoker@gen-lang-client-0874846742.iam.gserviceaccount.com \
     --project=gen-lang-client-0874846742
   ```

   Must show:
   ```yaml
   bindings:
   - members:
     - serviceAccount:service-211636922435@gcp-sa-pubsub.iam.gserviceaccount.com
     role: roles/iam.serviceAccountTokenCreator
   ```

4. **Fix missing token creator:**
   ```bash
   gcloud iam service-accounts add-iam-policy-binding \
     scheduler-invoker@gen-lang-client-0874846742.iam.gserviceaccount.com \
     --project=gen-lang-client-0874846742 \
     --member="serviceAccount:service-211636922435@gcp-sa-pubsub.iam.gserviceaccount.com" \
     --role="roles/iam.serviceAccountTokenCreator"
   ```

### Cloud Scheduler Returns Error Code 13

**Symptoms:**
- Scheduler job shows `code: 13` (INTERNAL)
- Agent logs show FaissApiError

**Root Cause:**
The FAISS API on the droplet is unavailable.

**Checklist:**

1. **Check droplet health:**
   ```bash
   curl -s https://cratemusic.duckdns.org/health
   ```

2. **SSH and check containers:**
   ```bash
   ssh root@cratemusic.duckdns.org
   docker compose ps
   docker logs kexp-search-api --tail 50
   ```

3. **Restart if needed:**
   ```bash
   docker compose restart kexp-search-api
   ```

### Datasette Shows Stale Data

**Symptoms:**
- Datasette shows fewer insights than expected
- Database file has correct data but Datasette doesn't reflect it

**Root Cause:**
Datasette caches database state and needs restart.

**Fix:**
```bash
ssh root@cratemusic.duckdns.org
docker restart datasette
```

### Insights Not Being Generated

**Symptoms:**
- New plays have no insights
- PubSub messages aren't being processed

**Checklist:**

1. **Check Pub/Sub subscription health:**
   ```bash
   gcloud logging read 'resource.type="cloud_run_revision" resource.labels.service_name="crate-agent" httpRequest.requestUrl:"/pubsub"' \
     --project=gen-lang-client-0874846742 \
     --limit=10 \
     --format="table(timestamp,httpRequest.status)"
   ```

2. **Check scheduler runs:**
   ```bash
   gcloud scheduler jobs describe enrich-unprocessed \
     --location=us-west1 \
     --project=gen-lang-client-0874846742 \
     --format="yaml(lastAttemptTime,status)"
   ```

3. **Manually trigger enrichment:**
   ```bash
   gcloud scheduler jobs run enrich-unprocessed \
     --location=us-west1 \
     --project=gen-lang-client-0874846742
   ```

4. **Check agent logs:**
   ```bash
   gcloud logging read 'resource.type="cloud_run_revision" resource.labels.service_name="crate-agent" textPayload:*' \
     --project=gen-lang-client-0874846742 \
     --limit=20 \
     --freshness=30m
   ```

---

## Common Commands

### View Recent Agent Activity
```bash
gcloud logging read 'resource.type="cloud_run_revision" resource.labels.service_name="crate-agent"' \
  --project=gen-lang-client-0874846742 \
  --limit=20 \
  --format="table(timestamp,httpRequest.status,textPayload)"
```

### Check Insight Count
```bash
ssh root@cratemusic.duckdns.org "sqlite3 /root/crate/faiss-search-api/data/music_kb.sqlite 'SELECT COUNT(*) FROM insights'"
```

### Deploy Agent
```bash
cd packages/agent
gcloud builds submit --config=cloudbuild.yaml
```

### Deploy FAISS API
```bash
./scripts/deploy_to_droplet.sh
```

---

## Configuration Files

### Cloud Run
- Build: `packages/agent/cloudbuild.yaml`
- Dockerfile: `packages/agent/Dockerfile`

### Droplet
- Docker Compose: `faiss-search-api/docker-compose.yml`
- Caddy: `faiss-search-api/Caddyfile`
- Deploy script: `scripts/deploy_to_droplet.sh`

### Environment
- Agent secrets: GCP Secret Manager
- FAISS API: `.env` on droplet (not in repo)

---

## Configuration Reference

### All Environment Variables

| Variable | Service | Required | Source | Description |
|----------|---------|----------|--------|-------------|
| `ANTHROPIC_API_KEY` | agent | Yes | Secret Manager | Claude API key |
| `GOOGLE_AI_API_KEY` | agent | Yes | Secret Manager | Gemini API key |
| `FAISS_API_URL` | agent | Yes | Cloud Run env | URL to FAISS API |
| `FAISS_API_KEY` | agent | No | Cloud Run env | API key (placeholder ok) |
| `DATABASE_PATH` | faiss-api | Yes | .env on droplet | Path to SQLite |
| `PUBSUB_ENABLED` | faiss-api | No | .env on droplet | Enable Pub/Sub publishing |
| `GCP_PROJECT_ID` | faiss-api | If PubSub | .env on droplet | GCP project for Pub/Sub |

### GCP Secret Manager Secrets

| Secret Name | Purpose |
|-------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `gemini-api-key` | Google AI (Gemini) API key |

### Service URLs

| Service | URL | Purpose |
|---------|-----|---------|
| crate-agent | `https://crate-agent-cjatp5myqa-uw.a.run.app` | AI enrichment |
| FAISS API | `https://cratemusic.duckdns.org` | Search, timeline, database |
| Datasette | `https://cratemusic.duckdns.org:8001` (internal) | Database browser |

---

## Monitoring

### Health Check Script

Run the health check script to verify all services:

```bash
./scripts/health_check.sh
```

This checks:
- FAISS API health
- crate-agent Cloud Run status
- GCP project access
- Cloud Scheduler status
- Pub/Sub subscription status
- Database insight count (via SSH)

### Key Metrics to Watch

1. **Insight generation rate** - Should increase with new plays
2. **PubSub message age** - Should stay low (< 10 min)
3. **Scheduler success rate** - Hourly job should succeed
4. **Cloud Run error rate** - Should be < 1%

### Health Check Endpoints

| Service | Endpoint | Expected |
|---------|----------|----------|
| crate-agent | `/health` | `{"status":"ok"}` |
| FAISS API | `/health` | `{"status":"ok"}` |

---

## Recovery Procedures

### Full Agent Redeploy
```bash
cd packages/agent
pnpm build
gcloud builds submit --config=cloudbuild.yaml
```

### Recreate PubSub Subscription
```bash
gcloud pubsub subscriptions delete new-plays-to-agent --project=gen-lang-client-0874846742

gcloud pubsub subscriptions create new-plays-to-agent \
  --project=gen-lang-client-0874846742 \
  --topic=new-plays \
  --push-endpoint="https://crate-agent-cjatp5myqa-uw.a.run.app/pubsub" \
  --push-auth-service-account="scheduler-invoker@gen-lang-client-0874846742.iam.gserviceaccount.com" \
  --push-auth-token-audience="https://crate-agent-cjatp5myqa-uw.a.run.app" \
  --ack-deadline=300 \
  --min-retry-delay=10s \
  --max-retry-delay=600s
```

### Reset Scheduler
```bash
gcloud scheduler jobs pause enrich-unprocessed --location=us-west1 --project=gen-lang-client-0874846742
gcloud scheduler jobs resume enrich-unprocessed --location=us-west1 --project=gen-lang-client-0874846742
```
