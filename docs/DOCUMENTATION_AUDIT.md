# Documentation Audit Results

**Date:** 2025-12-19
**Auditor:** Claude
**Status:** Complete

## Summary

- **Total markdown files:** ~160 (excluding node_modules, .venv, effect-source)
- **Recommended for removal/archive:** 40+
- **Needs update:** 5
- **Keep as-is:** ~80

---

## Category 1: REMOVE/ARCHIVE (Outdated or Task-Specific)

### Root Level - Move to `/docs/archive/`

| File | Reason |
|------|--------|
| `SCROLLING_ALBUM_BAR_ANALYSIS.md` | Task-specific from Nov 2025, feature complete |
| `SCROLLING_ALBUM_BAR_IMPLEMENTATION.md` | Task-specific, now implemented |
| `SCROLLING_ALBUM_BAR_QUICK_SUMMARY.md` | Task-specific, now implemented |
| `OPTIMIZATION_CHECKLIST.md` | Task-specific from Nov 2025 |
| `REACTIVE_PATTERNS.md` | Move to docs/frontend/ |
| `DEPLOYMENT_READINESS.md` | Task checklist, all items completed |

### docs/plans/ - Archive All (27 files)

These are dated implementation plans from Nov-Dec 2025. All appear to be completed tasks. Move entire folder to `/docs/archive/plans/`.

### faiss-search-api/ - Consolidate (17 → 4 files)

Current state is confusing with overlapping docs:

| Keep/Consolidate | Archive/Remove |
|------------------|----------------|
| `README.md` (update) | `CHANGELOG.md` (outdated) |
| `DEPLOYMENT.md` (primary) | `DEPLOYMENT_GUIDE.md` (duplicate) |
| `DATABASE_SCHEMA.md` | `DEPLOYMENT_REVIEW.md` (task-specific) |
| `QUICK_REFERENCE.md` | `DOCUMENTATION_INDEX.md` (meta) |
| | `EMBEDDING_ENDPOINTS.md` (merge into README) |
| | `ENRICHMENT_PIPELINE.md` (merge into README) |
| | `FILE_ALIGNMENT.md` (internal detail) |
| | `HTTPS_SETUP.md` (one-time setup) |
| | `IMPLEMENTATION_SUMMARY.md` (outdated) |
| | `MBID_DEPLOYMENT.md` (task-specific) |
| | `MBID_FILTERING.md` (task-specific) |
| | `REFACTOR_SUMMARY.md` (task-specific) |
| | `TIMELINE_API.md` (merge into README) |

### packages/web/ - Archive Task-Specific

| Archive | Reason |
|---------|--------|
| `REACTIVITY_ANALYSIS.md` | Task-specific analysis |
| `SEARCH_WORKER_IMPLEMENTATION.md` | Feature complete |
| `SEARCH_WORKER_TESTING.md` | Feature complete |
| `STREAM_ATOMS_IMPLEMENTATION.md` | Feature complete |
| `STREAM_REACTIVITY_IMPROVEMENTS.md` | Task-specific |

---

## Category 2: NEEDS UPDATE

| File | Issue |
|------|-------|
| `/README.md` | Still says "Effect Monorepo Template" - needs Crate project overview |
| `/packages/agent/README.md` | Needs update for new art generation services |
| `/packages/domain/README.md` | May need update for current schema |
| `/faiss-search-api/README.md` | Needs consolidation of endpoint docs |

---

## Category 3: KEEP AS-IS (Current & Valuable)

### Core Documentation
- `AGENTS.md` - Effect-TS best practices for agents
- `GEMINI.md` - Gemini API notes
- `CLAUDE.local.md` - Local development context

### .claude/ Directory
All files current and actively used for agent configuration.

### docs/ Directory (non-plans)
- `docs/research/` - Reference material
- `docs/effect-patterns/` - Pattern library
- `docs/frontend/` - Frontend guides
- `docs/infrastructure/` - Infrastructure notes

### Package-Specific
- `packages/agent/docs/` - Art pipeline design docs (new)
- `packages/server/src/api/API_SPECIFICATION.md` - API spec
- `packages/claude_effect_docs/` - Effect documentation

---

## Recommended Actions

1. **Create `/docs/archive/`** folder
2. **Move 27 plan files** to `/docs/archive/plans/`
3. **Move root task docs** to `/docs/archive/`
4. **Consolidate faiss-search-api** docs
5. **Update README.md** with proper Crate overview
6. **Create ARCHITECTURE.md** with system diagram

---

## Next Steps

See `crate-07vs` for architecture documentation task.
