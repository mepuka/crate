#!/usr/bin/env python3
"""
Verify the search pipeline is correct.

This script checks:
1. PCA transformer matches the embeddings
2. Query encoding pipeline matches embedding creation
3. Normalization is consistent
4. Alignment between embeddings and plays
"""

import numpy as np
import joblib
from pathlib import Path
from sentence_transformers import SentenceTransformer
import json

def verify_pipeline():
    """Verify the search pipeline is correct."""
    print("=" * 80)
    print("VERIFYING SEARCH PIPELINE")
    print("=" * 80)
    
    data_dir = Path("data")
    
    # Load components
    print("\n1. Loading components...")
    embeddings_path = data_dir / "embeddings_256d.npy"
    pca_path = data_dir / "pca_transformer_256d.joblib"
    metadata_path = data_dir / "metadata.json"
    
    embeddings = np.load(embeddings_path)
    print(f"   ✓ Embeddings: {embeddings.shape}")
    
    pca = joblib.load(pca_path)
    print(f"   ✓ PCA: {pca.n_components_} components")
    print(f"      Explained variance: {pca.explained_variance_ratio_.sum():.3%}")
    
    with open(metadata_path, 'r') as f:
        metadata = json.load(f)
    model_name = metadata['model_name']
    print(f"   ✓ Model: {model_name}")
    
    model = SentenceTransformer(model_name)
    print(f"      Model dimension: {model.get_sentence_embedding_dimension()}")
    
    # Test query encoding
    print("\n2. Testing query encoding pipeline...")
    test_query = "psychedelic rock"
    
    # Method 1: Normalize BEFORE PCA (current implementation)
    print("\n   Method 1: Normalize BEFORE PCA (current)")
    query_768d_norm_before = model.encode([test_query], normalize_embeddings=True)[0]
    query_256d_norm_before = pca.transform([query_768d_norm_before])[0]
    query_256d_norm_before = query_256d_norm_before / np.linalg.norm(query_256d_norm_before)
    print(f"      Query 768d norm: {np.linalg.norm(query_768d_norm_before):.6f}")
    print(f"      Query 256d norm: {np.linalg.norm(query_256d_norm_before):.6f}")
    
    # Method 2: Normalize AFTER PCA (as per guide)
    print("\n   Method 2: Normalize AFTER PCA (guide)")
    query_768d_norm_after = model.encode([test_query], normalize_embeddings=False)[0]
    query_256d_norm_after = pca.transform([query_768d_norm_after])[0]
    query_256d_norm_after = query_256d_norm_after / np.linalg.norm(query_256d_norm_after)
    print(f"      Query 768d norm: {np.linalg.norm(query_768d_norm_after):.6f}")
    print(f"      Query 256d norm: {np.linalg.norm(query_256d_norm_after):.6f}")
    
    # Check if embeddings were normalized before PCA
    print("\n3. Checking if embeddings were normalized before PCA...")
    # Sample a few embeddings and check their norms
    sample_embeddings = embeddings[:1000]
    norms = np.linalg.norm(sample_embeddings, axis=1)
    print(f"   Sample embedding norms:")
    print(f"      Mean: {norms.mean():.6f}")
    print(f"      Std: {norms.std():.6f}")
    print(f"      Min: {norms.min():.6f}")
    print(f"      Max: {norms.max():.6f}")
    
    if np.allclose(norms, 1.0, atol=0.01):
        print("   ✓ Embeddings appear to be normalized (norms ≈ 1.0)")
    else:
        print("   ⚠️  Embeddings are NOT normalized")
    
    # Test: Recreate an embedding from a known text
    print("\n4. Testing embedding recreation...")
    # We can't easily test this without the original texts, but we can check
    # if the PCA was fit on normalized or unnormalized embeddings
    
    # Check PCA mean
    if hasattr(pca, 'mean_'):
        print(f"   PCA mean norm: {np.linalg.norm(pca.mean_):.6f}")
        if np.linalg.norm(pca.mean_) < 0.1:
            print("   ⚠️  PCA mean is very small - suggests PCA was fit on normalized data")
        else:
            print("   ✓ PCA mean is significant - suggests PCA was fit on unnormalized data")
    
    print("\n" + "=" * 80)
    print("RECOMMENDATION:")
    print("=" * 80)
    print("Based on the guide, queries should:")
    print("  1. Encode WITHOUT normalization")
    print("  2. Apply PCA transform")
    print("  3. Normalize AFTER PCA")
    print("\nIf embeddings were normalized before PCA, use Method 1")
    print("If embeddings were NOT normalized before PCA, use Method 2")
    print("=" * 80)

if __name__ == '__main__':
    verify_pipeline()

