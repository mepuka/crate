"""Hybrid search service combining FTS5 and FAISS with RRF."""
import logging
from dataclasses import dataclass
from typing import List, Optional, Dict, Tuple, TYPE_CHECKING

if TYPE_CHECKING:
    from .db_service import DatabaseService
    from .search_service import SearchService

logger = logging.getLogger(__name__)


@dataclass
class HybridResult:
    """Single result from hybrid search."""
    play_id: int
    rrf_score: float
    bm25_rank: Optional[int] = None
    faiss_rank: Optional[int] = None
    faiss_score: Optional[float] = None


class HybridSearchService:
    """
    Hybrid search combining FTS5 (BM25) and FAISS with RRF fusion.

    Uses Reciprocal Rank Fusion to merge results:
    RRF(d) = Σ 1/(k + rank_i(d)) where k=60
    """

    RRF_K = 60  # Standard RRF constant

    def __init__(
        self,
        db_service: "DatabaseService",
        search_service: "SearchService"
    ):
        """
        Initialize hybrid search service.

        Args:
            db_service: DatabaseService instance (for FTS5 queries)
            search_service: SearchService instance (for FAISS queries)
        """
        self.db = db_service
        self.faiss = search_service
        self._fts5_available: Optional[bool] = None

    @property
    def fts5_available(self) -> bool:
        """Check if FTS5 is available (cached)."""
        if self._fts5_available is None:
            self._fts5_available = self.db.check_fts5_available()
            if self._fts5_available:
                logger.info("FTS5 hybrid search enabled")
            else:
                logger.warning("FTS5 not available - hybrid search will use FAISS only")
        return self._fts5_available

    def search(
        self,
        query: str,
        k: int = 50,
        bm25_weight: float = 0.5,
        faiss_weight: float = 0.5,
        use_expansion: bool = True
    ) -> List[HybridResult]:
        """
        Perform hybrid search with RRF fusion.

        Args:
            query: Search query text
            k: Number of results to return
            bm25_weight: Weight for BM25 (0-1, 0 = disabled)
            faiss_weight: Weight for FAISS (0-1, 0 = disabled)
            use_expansion: Apply query expansion (unused for now)

        Returns:
            List of HybridResult sorted by RRF score (descending)
        """
        # Over-fetch from each system for good RRF overlap
        fetch_k = min(k * 2, 200)

        bm25_results: Dict[int, int] = {}  # play_id -> rank
        faiss_results: Dict[int, Tuple[int, float]] = {}  # play_id -> (rank, score)

        # FTS5 search (if enabled and weighted)
        if bm25_weight > 0 and self.fts5_available:
            try:
                fts_hits = self.db.fts5_search(query, limit=fetch_k)
                for rank, (play_id, _score) in enumerate(fts_hits, start=1):
                    bm25_results[play_id] = rank
                logger.debug(f"FTS5 returned {len(fts_hits)} results for '{query}'")
            except Exception as e:
                logger.warning(f"FTS5 search failed: {e}")

        # FAISS search (if enabled and weighted)
        # Uses search_and_map() for atomic search + ID mapping under single mutex lock
        # Prevents hot_reload() from interleaving between search and ID mapping
        if faiss_weight > 0:
            try:
                # ATOMIC: search + ID mapping under same lock
                play_ids, distances = self.faiss.search_and_map(query, k=fetch_k)

                for rank, (play_id, score) in enumerate(
                    zip(play_ids.tolist(), distances.tolist()),
                    start=1
                ):
                    faiss_results[play_id] = (rank, float(score))
                logger.debug(f"FAISS returned {len(play_ids)} results for '{query}'")
            except Exception as e:
                logger.warning(f"FAISS search failed: {e}")

        # Merge with weighted RRF
        all_play_ids = set(bm25_results.keys()) | set(faiss_results.keys())

        if not all_play_ids:
            logger.warning(f"No results found for query: {query}")
            return []

        results: List[HybridResult] = []
        for play_id in all_play_ids:
            rrf_score = 0.0
            bm25_rank = bm25_results.get(play_id)
            faiss_data = faiss_results.get(play_id)
            faiss_rank = faiss_data[0] if faiss_data else None
            faiss_score = faiss_data[1] if faiss_data else None

            # Weighted RRF contribution
            if bm25_rank is not None:
                rrf_score += bm25_weight * (1.0 / (self.RRF_K + bm25_rank))
            if faiss_rank is not None:
                rrf_score += faiss_weight * (1.0 / (self.RRF_K + faiss_rank))

            results.append(HybridResult(
                play_id=play_id,
                rrf_score=rrf_score,
                bm25_rank=bm25_rank,
                faiss_rank=faiss_rank,
                faiss_score=faiss_score
            ))

        # Sort by RRF score descending, take top k
        results.sort(key=lambda r: r.rrf_score, reverse=True)

        logger.info(
            f"Hybrid search for '{query}': "
            f"BM25={len(bm25_results)}, FAISS={len(faiss_results)}, "
            f"merged={len(results[:k])}"
        )

        return results[:k]
