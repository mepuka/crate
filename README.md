# Crate

A music discovery platform that enriches KEXP radio play data with AI-generated insights, visual art, and knowledge graph connections.

## What is Crate?

Crate transforms the KEXP radio playlist into an explorable music discovery experience by:

- **AI Insights**: Generating contextual narratives about artists, albums, and musical connections
- **Visual Art**: Creating era-aware visual liner notes and album art enhancements
- **Knowledge Graph**: Surfacing relationships between artists, labels, and collaborators
- **Semantic Search**: Finding plays by meaning, not just keywords

## Architecture

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the full system architecture.

```
KEXP API → faiss-search-api (Digital Ocean) → Pub/Sub → crate-agent (Cloud Run)
                     ↓                                          ↓
                music_kb.sqlite ←──────────────────────── AI Enrichment
                     ↓
              crate-web (Firebase)
```

## Packages

| Package | Description |
|---------|-------------|
| `packages/agent` | AI agent for enrichment (Claude + Gemini) |
| `packages/web` | React frontend with Effect-TS + Jotai |
| `packages/domain` | Shared types and schemas |
| `faiss-search-api` | Python API with FAISS semantic search |

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run web dev server
cd packages/web && pnpm dev
```

## Tech Stack

- **Frontend**: React, TypeScript, Effect-TS, Jotai, TanStack Router, Tailwind
- **Agent**: TypeScript, Effect-TS, Claude API, Gemini API
- **Search API**: Python, FastAPI, FAISS, SQLite
- **Infrastructure**: GCP Cloud Run, Pub/Sub, Digital Ocean, Firebase

## Documentation

- [System Architecture](./docs/ARCHITECTURE.md)
- [Agent README](./packages/agent/README.md)
- [faiss-search-api README](./faiss-search-api/README.md)
- [Effect-TS Patterns](./docs/effect-patterns/README.md)
