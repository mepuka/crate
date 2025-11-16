# @crate/agent

AI agent for querying the KEXP FAISS search API using Effect AI.

## Overview

This package provides an Effect-based AI agent that can query the FAISS semantic search API for music recommendations, timeline browsing, and play information. Designed to run in Google Cloud containers for scheduled enrichment tasks and data processing.

## Architecture

```
MusicAgent (Effect AI + tools)
    ↓ depends on
FaissClient (Node HTTP client)
    ↓ depends on
FaissConfig | NodeHttpClient
```

### Key Components

- **FaissClient**: Type-safe HTTP client for the Python FAISS search API
- **MusicAgent**: AI agent service using Effect AI to answer music queries
- **FaissConfig**: Configuration service reading from environment variables

## Configuration

The agent is configured via environment variables:

- `FAISS_API_URL`: URL of the FAISS search API (default: `http://localhost:8000`)

## Usage

### Local Development

```typescript
import { Effect } from "effect"
import { NodeRuntime } from "@effect/platform-node"
import { AgentAppLive, MusicAgent } from "@crate/agent"

const program = Effect.gen(function* () {
  const agent = yield* MusicAgent
  const response = yield* agent.ask("Find me some psychedelic rock")
  console.log(response)
})

NodeRuntime.runMain(program.pipe(Effect.provide(AgentAppLive)))
```

## Google Cloud Deployment

This package is designed to run in Google Cloud containers, providing on-demand and scheduled AI agents for music data enrichment.

### Deployment Targets

- **Cloud Run**: On-demand HTTP endpoint or scheduled triggers
- **Cloud Scheduler**: Periodic enrichment tasks
- **Pub/Sub**: Event-driven processing

### Prerequisites

1. **Google Cloud Project** with billing enabled
2. **gcloud CLI** installed and authenticated:
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```
3. **Enable required APIs**:
   ```bash
   gcloud services enable cloudbuild.googleapis.com
   gcloud services enable run.googleapis.com
   gcloud services enable containerregistry.googleapis.com
   ```

### Environment Variables

Set these before deploying:

```bash
export GCP_PROJECT_ID="your-project-id"
export GCP_REGION="us-central1"
export FAISS_API_URL="https://your-faiss-api.example.com"
```

### Deploy to Google Cloud Run

#### Option 1: Using the Deploy Script

```bash
# From the repository root
./packages/agent/deploy.sh
```

#### Option 2: Using Cloud Build Manually

```bash
# From the repository root
gcloud builds submit \
  --config packages/agent/cloudbuild.yaml \
  --substitutions _FAISS_API_URL="https://your-faiss-api.example.com" \
  .
```

#### Option 3: Local Docker Build (for testing)

```bash
# Build locally
./packages/agent/deploy.sh local

# Run locally
docker run -e FAISS_API_URL=http://localhost:8000 crate-agent:local
```

### Cloud Build Configuration

The `cloudbuild.yaml` file defines a multi-step build process:

1. **Build Docker image** from multi-stage Dockerfile
2. **Push to Container Registry** with commit SHA and `latest` tags
3. **Deploy to Cloud Run** with environment variables

### Dockerfile Structure

The Dockerfile uses a multi-stage build for optimal image size:

1. **Builder stage**: Installs dependencies and builds TypeScript
2. **Production stage**: Copies only built artifacts and production dependencies

### Cost Optimization

- **Cloud Run** charges only for request time (pay-per-use)
- Set **minimum instances to 0** for cost savings when idle
- Use **Cloud Scheduler** for periodic tasks instead of constantly running containers
- Consider **concurrency settings** to handle multiple requests per instance

### Monitoring and Logs

View logs in Google Cloud Console:
```bash
# Stream logs
gcloud run logs read crate-agent --region us-central1 --tail

# View in Cloud Console
open "https://console.cloud.google.com/run/detail/${GCP_REGION}/crate-agent/logs"
```

### Updating the Deployment

After making changes, redeploy:

```bash
./packages/agent/deploy.sh
```

Cloud Build will automatically build and deploy the new version.

### Environment-Specific Configuration

For multiple environments (dev, staging, prod), use Cloud Build substitutions:

```bash
# Development
gcloud builds submit \
  --config packages/agent/cloudbuild.yaml \
  --substitutions _FAISS_API_URL="https://dev-faiss.example.com" \
  .

# Production
gcloud builds submit \
  --config packages/agent/cloudbuild.yaml \
  --substitutions _FAISS_API_URL="https://prod-faiss.example.com" \
  .
```

## License

MIT
