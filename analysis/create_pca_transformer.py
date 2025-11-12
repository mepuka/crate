#!/usr/bin/env python3
"""
Create PCA transformer from original embeddings.

This script recreates the PCA transformer that was used to reduce embeddings
from 768 to 256 dimensions. You need the original 768d embeddings to run this.

Usage:
    python create_pca_transformer.py --embeddings_768d path/to/original_embeddings.npy --output data/pca_256.pkl
"""

import argparse
import pickle
import numpy as np
from pathlib import Path
from sklearn.decomposition import PCA


def create_pca_transformer(
    embeddings_768d_path: Path,
    output_path: Path,
    n_components: int = 256,
    random_state: int = 42
):
    """
    Create and save PCA transformer from original embeddings.
    
    Args:
        embeddings_768d_path: Path to original 768d embeddings .npy file
        output_path: Path to save PCA transformer .pkl file
        n_components: Number of components for PCA (default: 256)
        random_state: Random state for reproducibility (default: 42)
    """
    print("=" * 80)
    print("Creating PCA Transformer")
    print("=" * 80)
    
    # Load original embeddings
    print(f"\nLoading original embeddings from {embeddings_768d_path}...")
    if not embeddings_768d_path.exists():
        raise FileNotFoundError(
            f"Original embeddings not found: {embeddings_768d_path}\n"
            "You need the original 768d embeddings to create the PCA transformer."
        )
    
    embeddings_768d = np.load(embeddings_768d_path)
    print(f"✓ Loaded embeddings: {embeddings_768d.shape}")
    
    if embeddings_768d.shape[1] != 768:
        raise ValueError(
            f"Expected 768 dimensions, got {embeddings_768d.shape[1]}\n"
            "Make sure you're using the original embeddings, not the reduced ones."
        )
    
    # Fit PCA
    print(f"\nFitting PCA with {n_components} components (random_state={random_state})...")
    pca = PCA(n_components=n_components, random_state=random_state)
    embeddings_256d = pca.fit_transform(embeddings_768d)
    
    # Calculate variance explained
    variance_explained = pca.explained_variance_ratio_.sum()
    
    print(f"✓ PCA fitted")
    print(f"  Original shape: {embeddings_768d.shape}")
    print(f"  Reduced shape: {embeddings_256d.shape}")
    print(f"  Variance explained: {variance_explained:.3%}")
    
    # Verify it matches existing reduced embeddings if they exist
    reduced_path = output_path.parent / "embeddings_256d.npy"
    if reduced_path.exists():
        print(f"\nVerifying against existing reduced embeddings...")
        existing_reduced = np.load(reduced_path)
        print(f"  Existing reduced: {existing_reduced.shape}")
        
        # Check if shapes match
        if existing_reduced.shape == embeddings_256d.shape:
            # Check if values are close (allowing for normalization differences)
            # Note: The existing embeddings might be normalized, so we'll just check shape
            print(f"  ✓ Shapes match!")
            print(f"  ⚠️  Note: Values may differ if existing embeddings were normalized")
        else:
            print(f"  ⚠️  WARNING: Shapes don't match!")
            print(f"     This PCA may not match the one used to create the existing embeddings.")
    
    # Save PCA transformer
    print(f"\nSaving PCA transformer to {output_path}...")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'wb') as f:
        pickle.dump(pca, f)
    
    print(f"✓ PCA transformer saved!")
    print(f"\nYou can now use this PCA transformer for query encoding.")
    print("=" * 80)


def main():
    parser = argparse.ArgumentParser(
        description="Create PCA transformer from original 768d embeddings"
    )
    parser.add_argument(
        '--embeddings_768d',
        type=Path,
        required=True,
        help='Path to original 768d embeddings .npy file'
    )
    parser.add_argument(
        '--output',
        type=Path,
        default=Path('data/pca_256.pkl'),
        help='Output path for PCA transformer .pkl file (default: data/pca_256.pkl)'
    )
    parser.add_argument(
        '--n_components',
        type=int,
        default=256,
        help='Number of PCA components (default: 256)'
    )
    parser.add_argument(
        '--random_state',
        type=int,
        default=42,
        help='Random state for reproducibility (default: 42)'
    )
    
    args = parser.parse_args()
    
    try:
        create_pca_transformer(
            embeddings_768d_path=args.embeddings_768d,
            output_path=args.output,
            n_components=args.n_components,
            random_state=args.random_state
        )
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == '__main__':
    exit(main())



