#!/usr/bin/env python3
"""
Quick local test of embedding different models with enriched music data.

Run this to test which embedding model works best with your data BEFORE
processing the full 2.2M records in Colab.

Usage:
    pip install sentence-transformers scikit-learn
    python test_local_embedding.py
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from crate_analysis import Database, enrich_play_text
from sentence_transformers import SentenceTransformer
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
import time

print("🎵 Testing Music Embedding Models Locally\n")
print("=" * 80)

# Connect to database
print("\n📊 Loading sample data from database...")
db = Database()

# Get a sample of plays
sample_size = 100
sample_plays = db.query(f"""
    SELECT *
    FROM fact_plays
    ORDER BY RANDOM()
    LIMIT {sample_size}
""")

print(f"Loaded {len(sample_plays)} sample plays")

# Enrich the texts
print("\n📝 Enriching texts with metadata...")
enriched_texts = []
for idx, row in sample_plays.iterrows():
    text = enrich_play_text(row.to_dict())
    enriched_texts.append(text)

# Show examples
print("\n💡 Example enriched texts:\n")
for i, text in enumerate(enriched_texts[:5], 1):
    print(f"{i}. {text}")
    print()

# Models to test
models_to_test = [
    {
        'name': 'all-MiniLM-L6-v2',
        'model_id': 'sentence-transformers/all-MiniLM-L6-v2',
        'description': 'Fast & lightweight (90MB)',
        'dims': 384
    },
    {
        'name': 'all-mpnet-base-v2',
        'model_id': 'sentence-transformers/all-mpnet-base-v2',
        'description': 'Higher quality (400MB)',
        'dims': 768
    },
    {
        'name': 'BGE-large-en-v1.5',
        'model_id': 'BAAI/bge-large-en-v1.5',
        'description': 'State-of-the-art (1.3GB)',
        'dims': 1024
    }
]

print(f"\n🧪 Testing {len(models_to_test)} embedding models...\n")
print("=" * 80)

results = {}

for model_info in models_to_test:
    print(f"\n🔬 Testing: {model_info['name']}")
    print(f"   Description: {model_info['description']}")
    print(f"   Dimensions: {model_info['dims']}")

    try:
        # Load model
        print(f"   Loading model...")
        model = SentenceTransformer(model_info['model_id'])

        # Encode texts and measure time
        print(f"   Encoding {len(enriched_texts)} texts...")
        start_time = time.time()
        embeddings = model.encode(enriched_texts, show_progress_bar=False)
        encode_time = time.time() - start_time

        speed = len(enriched_texts) / encode_time

        print(f"   ✅ Encoded in {encode_time:.2f}s ({speed:.0f} texts/sec)")

        results[model_info['name']] = {
            'embeddings': embeddings,
            'speed': speed,
            'dims': model_info['dims'],
            'encode_time': encode_time
        }

    except Exception as e:
        print(f"   ❌ Error: {e}")
        continue

print("\n" + "=" * 80)
print("\n📊 Performance Summary:\n")

for name, data in results.items():
    print(f"{name}:")
    print(f"  Speed: {data['speed']:.0f} texts/sec")
    print(f"  Dimensions: {data['dims']}")
    print(f"  Time for {sample_size} texts: {data['encode_time']:.2f}s")
    print()

# Test semantic search with example queries
print("\n" + "=" * 80)
print("\n🔍 Testing Semantic Search Quality\n")

test_queries = [
    "chill electronic ambient music",
    "energetic indie rock guitar",
    "jazz experimental saxophone",
    "heavy metal aggressive",
    "folk acoustic singer songwriter"
]

print(f"Testing {len(test_queries)} example queries:")
for q in test_queries:
    print(f"  • {q}")

print("\n" + "=" * 80)

for query in test_queries:
    print(f"\n🔎 Query: '{query}'\n")

    for name, data in results.items():
        # Encode query
        model = SentenceTransformer(models_to_test[[m['name'] for m in models_to_test].index(name)]['model_id'])
        query_embedding = model.encode([query])[0]

        # Compute similarities
        similarities = cosine_similarity([query_embedding], data['embeddings'])[0]

        # Get top 3 results
        top_indices = np.argsort(similarities)[::-1][:3]

        print(f"  {name}:")
        for i, idx in enumerate(top_indices, 1):
            score = similarities[idx]
            text = enriched_texts[idx]
            # Truncate text if too long
            if len(text) > 100:
                text = text[:100] + "..."
            print(f"    {i}. [{score:.3f}] {text}")
        print()

print("=" * 80)
print("\n✨ Manual Evaluation:")
print("   Look at the top results for each query")
print("   Which model gives the most relevant results?")
print("   Are the semantic matches making sense?")
print("\n💡 Recommendation:")
print("   If BGE-large gives clearly better results → use it (you have GPU)")
print("   If MiniLM is good enough → use it (5x faster)")
print("   If quality is poor → consider fine-tuning")

db.close()
print("\n✅ Testing complete!")
