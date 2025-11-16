# Deployment Guide: crate-agent to Google Cloud

## Current Status: ✅ Ready to Deploy

All prerequisites verified:
- ✅ gcloud CLI installed (v543.0.0)
- ✅ Authenticated as: kokokessy@gmail.com
- ✅ Project: gen-lang-client-0874846742
- ✅ Region: us-west1
- ✅ All required APIs enabled

## Quick Start

### 1. Set FAISS API URL
Edit `.gcloudrc`:
```bash
FAISS_API_URL=https://your-production-faiss-api.com
```

### 2. Deploy
```bash
cd packages/agent
./deploy.sh
```

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

## Service Configuration

- **Project:** gen-lang-client-0874846742
- **Region:** us-west1
- **Memory:** 512Mi
- **CPU:** 1 vCPU
- **Scaling:** 0-10 instances (scales to zero)

## Monitoring

View logs:
```bash
gcloud run services logs tail crate-agent --region us-west1
```

Service URL:
```bash
gcloud run services describe crate-agent --region us-west1 --format="value(status.url)"
```

## Cost Estimate
~$0.05-0.20 per day with occasional usage (scales to zero when idle)
