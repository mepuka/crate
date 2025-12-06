# Insight Evaluation & Viewing Tooling Plan

**Date:** 2025-12-05
**Status:** Research Complete, Ready for Implementation Planning

## Executive Summary

This document synthesizes research on building evaluation and viewing tooling for the Crate music insight agent. The goal is efficient viewing and evaluation to target improvements to the agent flow.

## Current State Analysis

### What We Have
- **6 insight types**: Concert, Cover, Sample, PlayHistory, Connection, Link
- **SQLite storage** with full JSON data + denormalized MBID indexes
- **Effect spans** logging iteration count, tool names, insight types
- **Datasette** already running on the droplet (port 8001)
- **Session-aware deduplication** via InsightSessionService

### Critical Gaps for Evaluation
1. **Tool call details** - Only names logged, not parameters or results
2. **Model reasoning** - No capture of WHY decisions were made
3. **Confidence rationale** - Just a string, no justification
4. **Full conversation history** - Not persisted
5. **Tool performance metrics** - No timing/error rates

## Evaluation Dimensions

Based on research, evaluate insights across:

| Dimension | Automated? | Method |
|-----------|------------|--------|
| **Factual accuracy** | Partial | MusicBrainz validation, URL checks |
| **Relevance** | No | Human review |
| **Novelty** | Partial | Dedupe detection, uniqueness scoring |
| **Coherence** | Partial | LLM-as-judge |
| **Actionability** | No | Human review + engagement metrics |
| **Confidence calibration** | No | Human review vs stated confidence |

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     EVALUATION STACK                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  Langfuse   │    │  Datasette  │    │  Streamlit  │         │
│  │  (tracing)  │    │  (SQL view) │    │ (eval UI)   │         │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘         │
│         │                  │                  │                 │
│         └──────────────────┼──────────────────┘                 │
│                            │                                    │
│                    ┌───────┴───────┐                           │
│                    │   SQLite DB   │                           │
│                    │  (insights +  │                           │
│                    │  eval_context)│                           │
│                    └───────────────┘                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Tier 1: Quick Wins (Use What We Have)

**Datasette** - Already deployed, extend with:
- Custom SQL views for insight analysis
- `datasette-dashboards` plugin for aggregate metrics
- `datasette-vega` for visualizations

**Effect Spans** - Enhance existing tracing:
- Add tool parameters and result summaries to spans
- Add `eval_context` JSON field to insights table

### Tier 2: Evaluation UI (New)

**Streamlit App** - Custom evaluation interface:
- Side-by-side insight comparison
- Rating scales (1-5 for relevance, novelty, accuracy)
- Quick annotation (thumbs up/down, error tagging)
- Filter by insight type, confidence, date range

### Tier 3: Production Observability (Optional)

**Langfuse** (self-hosted, MIT license):
- Full trace visualization
- Annotation queues
- Prompt versioning for A/B tests

## Implementation Phases

### Phase 1: Data Capture Enhancement (1-2 days)

**Goal:** Capture evaluation-critical data without changing agent behavior

1. **Add `eval_context` to insights table:**
```sql
ALTER TABLE insights ADD COLUMN eval_context JSON;
```

2. **Capture in agent:**
```typescript
eval_context: {
  session_id: string,
  iteration_count: number,
  tools_called: string[],  // Ordered list
  total_tool_calls: number,
  research_duration_ms: number,
  model: string,  // e.g., "claude-sonnet-4-20250514"
}
```

3. **Add tool call detail table:**
```sql
CREATE TABLE insight_tool_calls (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  play_id INTEGER,
  iteration INTEGER,
  tool_name TEXT,
  parameters JSON,
  result_summary JSON,  -- Truncated for storage
  result_count INTEGER,
  duration_ms INTEGER,
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Phase 2: Datasette Views (1 day)

**Goal:** SQL-based analysis without new infrastructure

1. **Create analysis views:**
```sql
-- Insight distribution by type
CREATE VIEW v_insight_distribution AS
SELECT
  insight_type,
  confidence,
  COUNT(*) as count,
  DATE(created_at) as date
FROM insights
WHERE deleted_at IS NULL
GROUP BY insight_type, confidence, DATE(created_at);

-- Tool usage patterns
CREATE VIEW v_tool_usage AS
SELECT
  json_extract(eval_context, '$.session_id') as session_id,
  json_extract(eval_context, '$.iteration_count') as iterations,
  json_extract(eval_context, '$.tools_called') as tools,
  COUNT(*) as insight_count
FROM insights
WHERE eval_context IS NOT NULL
GROUP BY session_id;

-- Confidence calibration prep
CREATE VIEW v_confidence_review AS
SELECT
  id,
  insight_type,
  confidence,
  summary,
  json_extract(data, '$.sourceQuote') as source_quote,
  created_at
FROM insights
WHERE deleted_at IS NULL
ORDER BY created_at DESC;
```

2. **Install Datasette plugins on droplet:**
```bash
pip install datasette-dashboards datasette-vega
```

### Phase 3: Streamlit Evaluation UI (2-3 days)

**Goal:** Human-in-the-loop evaluation interface

**Features:**
- Browse insights with filters (type, confidence, date)
- View full insight JSON + source play context
- Rating interface (1-5 scales)
- Error tagging (hallucination, irrelevant, duplicate, etc.)
- Batch review mode (10 insights at a time)
- Export evaluations to CSV

**Schema for human evaluations:**
```sql
CREATE TABLE insight_evaluations (
  id INTEGER PRIMARY KEY,
  insight_id INTEGER NOT NULL REFERENCES insights(id),
  evaluator TEXT,  -- Who rated it
  relevance INTEGER CHECK(relevance BETWEEN 1 AND 5),
  novelty INTEGER CHECK(novelty BETWEEN 1 AND 5),
  accuracy INTEGER CHECK(accuracy BETWEEN 1 AND 5),
  error_tags JSON,  -- ["hallucination", "duplicate", etc.]
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Phase 4: Automated Metrics (1-2 days)

**Goal:** Scalable quality signals

1. **Hallucination detection** - LLM-as-judge for factual claims
2. **URL validation** - For Link insights, check if URLs resolve
3. **MusicBrainz validation** - Verify referenced MBIDs exist
4. **Duplicate detection** - Semantic similarity to recent insights

```sql
CREATE TABLE insight_auto_scores (
  id INTEGER PRIMARY KEY,
  insight_id INTEGER NOT NULL REFERENCES insights(id),
  url_valid BOOLEAN,
  mbid_valid BOOLEAN,
  duplicate_score REAL,  -- 0-1, similarity to nearest match
  llm_coherence_score REAL,  -- 0-1 from LLM judge
  scored_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

## Tooling Recommendations

### Recommended Stack

| Layer | Tool | Rationale |
|-------|------|-----------|
| **Tracing** | Effect spans → JSON logs | Already have it, enhance vs replace |
| **SQL Analysis** | Datasette | Already deployed, plugin ecosystem |
| **Eval UI** | Streamlit | Maximum flexibility, Python native |
| **Observability** | Langfuse (optional) | MIT license, self-hosted, if scale needed |

### Why NOT Other Tools

- **Braintrust** - Enterprise pricing, no self-host
- **LangSmith** - LangChain ecosystem lock-in
- **Humanloop** - Sunset September 2025 (acquired by Anthropic)
- **Grafana/Jaeger** - Overkill for current scale

## Evaluation Workflow

### Daily Review Process

1. **Morning:** Review overnight enrichment via Datasette dashboard
   - Insight count by type
   - Confidence distribution
   - Error rate (URL failures, MBID misses)

2. **Sampling:** Use Streamlit to review 10-20 insights
   - Stratified by type and confidence
   - Rate on 1-5 scales
   - Tag errors

3. **Weekly:** Aggregate analysis
   - Confidence calibration (is "high" actually high quality?)
   - Tool effectiveness (do more iterations = better insights?)
   - Error pattern analysis

### A/B Testing Workflow

1. Create prompt variant in `system-prompt.ts`
2. Deploy with feature flag (session_id prefix)
3. Run both variants for N plays
4. Compare via Datasette queries:
   - Insight count/type distribution
   - Human evaluation scores
   - Error rates

## Metrics to Track

### Quality Metrics
- **Accuracy rate** - % of insights passing human review
- **Confidence calibration** - Correlation of stated vs actual quality
- **Novelty score** - % of insights rated as "new information"
- **Error taxonomy** - Distribution of error types

### Efficiency Metrics
- **Insights per play** - Average yield
- **Iterations per insight** - Research effort required
- **Tool call efficiency** - Useful results per tool call
- **Research duration** - Time to produce insights

### Business Metrics
- **Coverage** - % of plays with at least one insight
- **Type diversity** - Distribution across 6 insight types
- **Freshness** - Age of most recent insight

## Next Steps

1. **Immediate:** Add `eval_context` column to insights table
2. **This week:** Create Datasette views + dashboard
3. **Next week:** Build Streamlit evaluation UI
4. **Ongoing:** Weekly review cadence, iterate on agent prompts

## Appendix: Tool Comparison Matrix

| Tool | License | Self-Hosted | Integration | Best For |
|------|---------|-------------|-------------|----------|
| **Langfuse** | MIT | Yes | Low | Full observability |
| **Phoenix** | ELv2 | Yes | Low | One-command deploy |
| **Promptfoo** | MIT | Yes | Low | CLI-based eval |
| **Streamlit** | Apache 2.0 | Yes | Low | Custom UIs |
| **Datasette** | Apache 2.0 | Yes | Low | SQL exploration |
| **Label Studio** | Apache 2.0 | Yes | Medium | Annotation |
| **Argilla** | Apache 2.0 | Yes | Medium | Custom annotation |

## References

- [Langfuse Open Source Announcement](https://langfuse.com/blog/2025-06-04-open-sourcing-langfuse-product)
- [LLM Evaluation Best Practices](https://www.confident-ai.com/blog/llm-evaluation-metrics-everything-you-need-for-llm-evaluation)
- [Human-in-the-Loop Workflows](https://www.comet.com/site/blog/human-in-the-loop/)
- [A/B Testing LLM Systems](https://langfuse.com/docs/prompt-management/features/a-b-testing)
