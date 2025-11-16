# Play Enrichment Pipeline Design

**Date:** 2025-11-15  
**Status:** Approved  
**Author:** Claude + User

## Overview

End-to-end pipeline for enriching KEXP play data using Cloud Run agent with Effect AI. Initial implementation uses "hello world" enrichment to validate the pipeline before adding AI-powered analysis.

## Architecture

### Flow Diagram

```
KEXP API → Python Sync Script → Cloud Run Agent → Python FAISS API
                 (Droplet)          (GCP)           (Droplet)
                    ↓                 ↓                 ↓
                Insert plays      Enrich data      Store enrichments
```

### Components

1. **Python Sync Script** (existing, modified)
   - Fetches plays from KEXP API
   - Inserts into SQLite database  
   - Triggers agent with play IDs (fire-and-forget)

2. **Cloud Run Agent** (new, Effect-based)
   - Receives play IDs via HTTP POST
   - Fetches play data from FAISS API
   - Generates enrichments
   - POSTs results back to FAISS API

3. **Python FAISS API** (existing, modified)
   - New GET endpoint for batch play fetching
   - New POST endpoint for storing enrichments
   - API key authentication

[REST OF DESIGN DOCUMENT CONTENT...]
