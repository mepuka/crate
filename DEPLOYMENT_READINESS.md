# Crate Deployment Readiness Assessment

**Date:** December 15, 2025
**Branch:** adjunct_new
**Latest Commit:** d95a699 - "Add PubSub trigger and Cloud Run hardening for agent"

---

## Task Tracker

### Pre-Production Checklist

#### Frontend (packages/web)

- [x] **~~DEV guard for devtools~~** - Wrapped `<TanStackRouterDevtools />` in `import.meta.env.DEV` check
  - File: `src/routes/__root.tsx:23`
  - Completed: 2025-12-15

- [x] **~~Remove demo routes~~** - Added production redirect guards to demo routes
  - Files: `src/routes/stream-demo.tsx`, `src/routes/test-components.tsx`
  - Completed: 2025-12-15

- [x] **~~Remove console statements~~** - Removed unnecessary console.error calls, kept intentional warnings
  - Files: `StreamTimelineDemo.tsx`, `ScrollingAlbumBar.tsx`, `timeline-infinite.ts`
  - Completed: 2025-12-15

- [x] **~~Fix @ts-ignore comments~~** - Replaced with proper type guards using `isErrorStatus()`
  - File: `src/components/StreamTimelineDemo.tsx`
  - Completed: 2025-12-15

- [x] **~~Schema validation for insights~~** - Added proper Schema.decodeUnknown with PlayInsightsResponse
  - File: `src/atoms/insights.ts`
  - Completed: 2025-12-15

- [x] **~~ScrollingAlbumBar Date parsing~~** - Fixed worker serialization issue
  - File: `src/components/ScrollingAlbumBar.tsx:420`
  - Completed: 2025-12-15

#### Agent (packages/agent)

- [x] **~~Move test file~~** - Moved `test-phase3.ts` to `scripts/`
  - From: `src/services/test-phase3.ts`
  - To: `scripts/test-phase3.ts`
  - Completed: 2025-12-15

- [x] **~~Add .env to gitignore~~** - Already covered by root `.gitignore`
  - Verified: `.env` pattern in root gitignore
  - Completed: 2025-12-15

#### FAISS API (faiss-search-api/) - Optional for MVP

- [ ] **Rate limiting** - Add SlowAPI for DoS protection
  - File: `app/main.py`
  - Time: 2-3 hours

- [ ] **Fix image proxy subdomain check** - Logic error in domain validation
  - File: `app/main.py:1490-1492`
  - Time: 30 min

---

## Executive Summary

| Component | Status | Effort to Deploy | Critical Fixes |
|-----------|--------|------------------|----------------|
| **Frontend (Web)** | Ready with fixes | 2-3 hours | 6 items |
| **FAISS API** | Ready | 4 hours (security hardening) | 0 blocking |
| **Agent** | Ready | 1-2 hours (including testing) | 0 blocking |

**Overall Verdict: READY FOR DEPLOYMENT** with approximately 6-8 hours of cleanup work recommended before production launch.

---

## Component Assessments

### 1. Frontend (packages/web)

**Status: READY WITH NOTED CONCERNS**

The frontend is architecturally sound with excellent state management (Effect-Atom), virtualized timeline, and proper environment configuration for Firebase Hosting.

#### Critical Fixes (Must Do Before Production)

| Issue | Location | Fix Time |
|-------|----------|----------|
| TypeScript `@ts-ignore` without explanation | StreamTimelineDemo.tsx | 30 min |
| Unsafe type casting in insights API | atoms/insights.ts:48 | 15 min |
| Dev tools exposed in production | routes/__root.tsx:23 | 5 min |
| Demo routes in production build | routes/stream-demo.tsx, test-components.tsx | 15 min |
| Console statements (8 total) | Various | 20 min |
| OffscreenCanvas crash | ScrollingAlbumBar.tsx | 20 min |

#### Known Design Debt (Acknowledged)

- **Timeline UI**: Functional but needs polish (hover states, filter transitions)
- **Insights UI**: Data layer solid, visual design minimal - earmarked for post-launch refinement

#### Quick Wins

```typescript
// __root.tsx - Wrap devtools
{import.meta.env.DEV && <TanStackRouterDevtools />}

// insights.ts - Add Schema validation
const insights = Schema.decodeUnknown(InsightsResponse)(json.insights)
```

---

### 2. FAISS Search API (faiss-search-api/)

**Status: READY FOR DEPLOYMENT**

Excellent architecture with memory-efficient design (mmap), proper input validation, and security measures (domain whitelist, API key auth, CORS).

#### High Priority (Before Public Exposure)

| Issue | Impact | Fix Time |
|-------|--------|----------|
| No rate limiting | DoS vulnerability | 2-3 hours |
| API key in plaintext env | Security | 3-4 hours |
| SQLite thread-safety | Race conditions | 1-2 hours |
| No request timeouts | Hanging requests | 1-2 hours |

#### Quick Wins (1 hour total)

```python
# Fix image proxy subdomain check (30 min)
def is_subdomain_of(domain: str, parent: str) -> bool:
    return domain == parent or domain.endswith('.' + parent)

# Remove duplicate db_service (5 min)
# Line 48-49 in main.py

# Add auth failure logging (15 min)
if expected_key and x_api_key != expected_key:
    logger.warning(f"Auth failure from {request.client.host}")

# Add rate limiting with SlowAPI (30 min)
from slowapi import Limiter
limiter = Limiter(key_func=get_remote_address)
```

#### Deployment Notes

- Docker multi-stage build optimized
- Memory limit: 3.5GB (appropriate for index + models)
- Health check: 5-minute startup period for model loading
- Data files required: embeddings_384d.index (3.2GB), music_kb.sqlite (1.3GB), play_ids.npy (17MB)

---

### 3. Agent (packages/agent)

**Status: READY FOR DEPLOYMENT**

Well-structured Effect-TS service with proper Cloud Run configuration and Pub/Sub integration. Recent commit (d95a699) specifically hardened for production.

#### P0 Tasks (15 minutes)

| Task | Location |
|------|----------|
| Verify insight parsing (TODO comment) | MusicAgent.ts:642 |
| Move test-phase3.ts out of src/ | src/services/test-phase3.ts |
| Add .env to .gitignore | packages/agent/.env |

#### Trigger Architecture

**Current Implementation:**
- `/pubsub` endpoint accepts Pub/Sub push messages
- Base64 decodes `{ play_ids: [123, 456, 789] }`
- Processes plays sequentially (concurrency: 1)
- Posts insights per-play to FAISS API

**For Per-Play Processing:**
The code already supports single-item arrays. To trigger on each play:
- Configure publisher to send one message per play: `{ play_ids: [PLAY_ID] }`
- Or batch plays with current implementation (works fine)

**Remaining Decision:** How should Pub/Sub messages be published?
- Option A: One message per new play (immediate enrichment)
- Option B: Batch messages (e.g., every 5 minutes)

Both are supported by current agent code.

---

## Deployment Sequence

### Phase 1: FAISS API (Foundation)

```bash
# Already deployed, verify:
curl https://your-faiss-api/health

# Apply quick fixes locally, redeploy
docker-compose build && docker-compose up -d
```

### Phase 2: Agent (Cloud Run)

```bash
cd packages/agent

# Set environment
export ANTHROPIC_API_KEY=...
export FAISS_API_URL=https://your-faiss-api
export PUBSUB_INVOKER_EMAIL=service-account@project.iam.gserviceaccount.com

# Deploy
./deploy.sh production
```

### Phase 3: Frontend (Firebase)

```bash
cd packages/web

# Apply critical fixes
# Then build and deploy
pnpm build
firebase deploy --only hosting
```

### Phase 4: Pub/Sub Integration

```bash
# Create topic
gcloud pubsub topics create new-play-topic

# Create push subscription to agent
gcloud pubsub subscriptions create new-play-sub \
  --topic=new-play-topic \
  --push-endpoint=https://agent-url/pubsub \
  --push-auth-service-account=pubsub-invoker@project.iam.gserviceaccount.com
```

---

## Cleanup Task Summary

### Must Do (Pre-Production)

| Component | Task | Time |
|-----------|------|------|
| Frontend | Fix @ts-ignore in StreamTimelineDemo | 30m |
| Frontend | Add DEV guard for devtools | 5m |
| Frontend | Remove/gate demo routes | 15m |
| Frontend | Remove console statements | 20m |
| Frontend | Add Schema validation to insights | 15m |
| FAISS | Add rate limiting | 2-3h |
| FAISS | Fix image proxy subdomain check | 30m |
| Agent | Verify insight parsing logic | 15m |
| Agent | Move test file out of src | 5m |
| **Total** | | **~5-6 hours** |

### Should Do (Shortly After)

| Component | Task | Time |
|-----------|------|------|
| FAISS | API key secrets management | 3-4h |
| FAISS | Request timeouts | 1-2h |
| FAISS | SQLite write locks | 1-2h |
| Frontend | Integration tests | 4h |
| Agent | Integration tests | 2h |
| All | Monitoring dashboards | 4h |

### Nice to Have (Future)

- FAISS API versioning (/api/v1/)
- Prometheus metrics across all services
- E2E tests for full user flows
- Architecture documentation with diagrams
- Runbooks for troubleshooting

---

## Known Limitations (Accepted for MVP)

1. **Timeline/Insights UI Design**: Functional but minimal styling - post-launch refinement planned
2. **Test Coverage**: Limited to unit tests - integration tests recommended post-launch
3. **No Monitoring Dashboards**: Rely on Cloud Run/Firebase default metrics initially
4. **Agent Per-Play Decision**: Needs clarification on triggering strategy (one message per play vs batches)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Rate limit abuse on FAISS | Medium | High | Add SlowAPI before public launch |
| Frontend crashes on edge cases | Low | Medium | Fix @ts-ignore, add Schema validation |
| Agent fails on malformed insights | Low | Low | Verify parsing logic |
| Pub/Sub auth issues | Low | High | Test with sample messages |

---

## Recommended Launch Plan

### Day -1: Final Prep
- Apply all "Must Do" fixes
- Run full builds for all components
- Deploy to staging environment

### Day 0: Soft Launch
- Deploy all components to production
- Manually trigger a few agent enrichments
- Monitor logs and error rates
- Keep timeline/insights UI behind feature flag if desired

### Day +1-7: Monitoring Period
- Watch for rate limit issues
- Monitor agent token usage and costs
- Gather user feedback on UI
- Apply "Should Do" fixes as needed

### Day +14: Design Iteration
- Begin timeline/insights UI refinement
- Add integration tests
- Set up monitoring dashboards

---

## Sign-Off

**Frontend:** Ready with 6 critical fixes (~2 hours)
**FAISS API:** Ready, recommend rate limiting before public exposure (~4 hours)
**Agent:** Ready after P0 tasks (~15 minutes)

**Total Effort to Production:** 6-8 hours of focused work

**Confidence Level:** HIGH - All components are architecturally sound with no fundamental blockers.
