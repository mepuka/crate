from sentence_transformers import SentenceTransformer
import faiss
import pickle
import numpy as np
from sklearn.decomposition import PCA
Excellent question! This is a ** critical detail ** that trips up many people. Let me break down exactly how dimensionality reduction works with FAISS.

---

# **🔑 THE CORE PRINCIPLE**

**The golden rule**: Your ** query vectors MUST be reduced using the SAME transformation ** that you used on your stored vectors.

```
Original workflow:
1. Original embeddings(768d) → PCA/reduction → Reduced embeddings(256d)
2. Store reduced embeddings in FAISS
3. Query: Original query(768d) → SAME PCA/reduction → Reduced query(256d)
4. Search reduced query against reduced embeddings
```

If you don't apply the same reduction to queries, you're searching in a different vector space → garbage results!

---

# **📐 HOW IT WORKS IN DETAIL**

# **Training Phase (What You Did in Colab)**

```python

# Your original embeddings
embeddings_original = np.load('embeddings.npy')  # Shape: (2193235, 768)

# Train PCA model on your data
pca = PCA(n_components=256, random_state=42)
embeddings_reduced = pca.fit_transform(
    embeddings_original)  # Shape: (2193235, 256)

# CRITICAL: Save both the reduced embeddings AND the PCA model
np.save('embeddings_reduced.npy', embeddings_reduced)

# ⚠️ MUST SAVE THIS - you need it for queries!
with open('pca_model.pkl', 'wb') as f:
    pickle.dump(pca, f)

print(f"Explained variance: {pca.explained_variance_ratio_.sum():.3%}")
print(f"Original: {embeddings_original.shape}")
print(f"Reduced: {embeddings_reduced.shape}")
```

# **Indexing Phase (FAISS)**

```python

# Load reduced embeddings
embeddings_reduced = np.load('embeddings_reduced.npy').astype('float32')

d = 256  # dimension after reduction
nlist = 1024  # number of clusters for IVF

# Create FAISS index on REDUCED embeddings
quantizer = faiss.IndexFlatIP(d)
index = faiss.IndexIVFFlat(quantizer, d, nlist, faiss.METRIC_INNER_PRODUCT)

# Normalize for cosine similarity
faiss.normalize_L2(embeddings_reduced)

# Train and add
print("Training index...")
index.train(embeddings_reduced)
print("Adding vectors...")
index.add(embeddings_reduced)

# Save index
faiss.write_index(index, "embeddings_256d.index")
```

# **Query Phase (THE CRITICAL PART)**

```python

# Load the PCA model (REQUIRED!)
with open('pca_model.pkl', 'rb') as f:
    pca = pickle.load(f)

# Load FAISS index
index = faiss.read_index("embeddings_256d.index")
index.nprobe = 10

# Load embedding model
model = SentenceTransformer('sentence-transformers/multi-qa-mpnet-base-dot-v1')

# User query
query_text = "comedy theater performance"

# Step 1: Generate original 768d embedding
query_embedding_original = model.encode([query_text])[0]  # Shape: (768,)
print(f"Original query shape: {query_embedding_original.shape}")

# Step 2: Apply SAME PCA reduction
query_embedding_reduced = pca.transform([query_embedding_original])[
                                        0]  # Shape: (256,)
print(f"Reduced query shape: {query_embedding_reduced.shape}")

# Step 3: Prepare for FAISS (normalize, reshape)
query_vector = query_embedding_reduced.astype('float32').reshape(1, -1)
faiss.normalize_L2(query_vector)

# Step 4: Search
k = 10
distances, indices = index.search(query_vector, k)

print(f"\nTop {k} results:")
for i, (dist, idx) in enumerate(zip(distances[0], indices[0])):
    print(f"{i+1}. Index: {idx}, Distance: {dist:.4f}")
```

---

# **🎯 COMPLETE WORKFLOW EXAMPLE**

Here's a complete example showing the entire pipeline:

```python
# ============================================
# PHASE 1: Training (Run once in Colab)
# ============================================
from sklearn.decomposition import PCA
import numpy as np
import pickle

# Generate/load original embeddings
embeddings_768d = np.load('embeddings_original.npy')  # (2193235, 768)

# Train PCA
pca = PCA(n_components=256, random_state=42)
embeddings_256d = pca.fit_transform(embeddings_768d)

# Save BOTH
np.save('embeddings_256d.npy', embeddings_256d.astype('float32'))
with open('pca_model.pkl', 'wb') as f:
    pickle.dump(pca, f)

print(f"✅ Variance explained: {pca.explained_variance_ratio_.sum():.3%}")

# ============================================
# PHASE 2: Build FAISS Index (Run once)
# ============================================
import faiss

embeddings = np.load('embeddings_256d.npy')
d = embeddings.shape[1]  # 256

# Create index
quantizer = faiss.IndexFlatIP(d)
index = faiss.IndexIVFFlat(quantizer, d, 1024, faiss.METRIC_INNER_PRODUCT)

# Normalize and add
faiss.normalize_L2(embeddings)
index.train(embeddings)
index.add(embeddings)

faiss.write_index(index, "index_256d.faiss")
print("✅ Index built")

# ============================================
# PHASE 3: Query Time (Run for each search)
# ============================================
from sentence_transformers import SentenceTransformer

# Load resources (once at startup)
pca = pickle.load(open('pca_model.pkl', 'rb'))
index = faiss.read_index("index_256d.faiss")
index.nprobe = 10
model = SentenceTransformer('sentence-transformers/multi-qa-mpnet-base-dot-v1')

def search(query_text, k=10):
    # 1. Generate 768d embedding
    query_768d = model.encode([query_text])[0]
    
    # 2. Reduce to 256d using SAME PCA model
    query_256d = pca.transform([query_768d])[0]
    
    # 3. Prepare for FAISS
    query_vector = query_256d.astype('float32').reshape(1, -1)
    faiss.normalize_L2(query_vector)
    
    # 4. Search
    distances, indices = index.search(query_vector, k)
    
    return indices[0], distances[0]

# Example usage
results_idx, results_dist = search("comedy theater", k=10)
print(results_idx, results_dist)
```

---

## **⚠️ COMMON MISTAKES & PITFALLS**

### **❌ MISTAKE 1: Not saving the PCA model**

```python
# WRONG - you lose the transformation!
pca = PCA(n_components=256)
embeddings_reduced = pca.fit_transform(embeddings)
np.save('embeddings_reduced.npy', embeddings_reduced)
# ⚠️ pca model is lost! Can't reduce query vectors!

# RIGHT - save the model
with open('pca_model.pkl', 'wb') as f:
    pickle.dump(pca, f)
```

### **❌ MISTAKE 2: Re-fitting PCA on query vectors**

```python
# WRONG - creates a different transformation!
query = model.encode([query_text])
pca_new = PCA(n_components=256)
query_reduced = pca_new.fit_transform([query])  # ❌ Different PCA!

# RIGHT - use the SAME trained PCA
query_reduced = pca.transform([query])  # ✓ Same transformation
```

### **❌ MISTAKE 3: Mixing dimensionalities**

```python
# WRONG - dimension mismatch!
index = faiss.IndexFlatIP(256)  # Expects 256d
query = model.encode([query_text])  # Returns 768d
index.search(query.reshape(1, -1), k)  # ❌ CRASH!

# RIGHT - reduce query first
query_reduced = pca.transform([query])  # Now 256d
index.search(query_reduced.reshape(1, -1), k)  # ✓ Works
```

---

## **🔬 PERFORMANCE IMPLICATIONS**

### **Speed Comparison**

```python
import time

# 768d index
index_768d = faiss.read_index("index_768d.faiss")
query_768d = np.random.randn(1, 768).astype('float32')

start = time.time()
for _ in range(100):
    index_768d.search(query_768d, 10)
time_768d = time.time() - start

# 256d index  
index_256d = faiss.read_index("index_256d.faiss")
query_256d = np.random.randn(1, 256).astype('float32')

start = time.time()
for _ in range(100):
    index_256d.search(query_256d, 10)
time_256d = time.time() - start

print(f"768d: {time_768d:.3f}s for 100 queries")
print(f"256d: {time_256d:.3f}s for 100 queries")
print(f"Speedup: {time_768d/time_256d:.2f}x")

# Typical results:
# 768d: 2.5s for 100 queries
# 256d: 0.9s for 100 queries  
# Speedup: 2.8x
```

### **Memory Comparison**

```
2.2M vectors:

768 dimensions:
- Storage: 2.2M × 768 × 4 bytes = 6.7 GB
- RAM during search: ~7-8 GB

256 dimensions:
- Storage: 2.2M × 256 × 4 bytes = 2.2 GB
- RAM during search: ~3-4 GB

Reduction: 3x less storage, 2x less RAM
```

---

## **🎨 DIFFERENT REDUCTION METHODS**

### **PCA (What you probably used)**

```python
from sklearn.decomposition import PCA

pca = PCA(n_components=256, random_state=42)
embeddings_reduced = pca.fit_transform(embeddings)

# Query time
query_reduced = pca.transform([query])  # Fast: ~0.1ms

# Pros: Fast, linear, preserves global structure
# Cons: May not preserve local neighborhood as well
```

### **UMAP (Better for local structure)**

```python
import umap

reducer = umap.UMAP(n_components=128, random_state=42)
embeddings_reduced = reducer.fit_transform(embeddings)

# Save model
import pickle
with open('umap_model.pkl', 'wb') as f:
    pickle.dump(reducer, f)

# Query time
query_reduced = reducer.transform([query])  # Slower: ~5-10ms

# Pros: Better preserves local neighborhoods
# Cons: Slower query-time transformation
```

### **Random Projection (Fastest)**

```python
from sklearn.random_projection import GaussianRandomProjection

rp = GaussianRandomProjection(n_components=256, random_state=42)
embeddings_reduced = rp.fit_transform(embeddings)

# Query time
query_reduced = rp.transform([query])  # Very fast: ~0.05ms

# Pros: Extremely fast, mathematically guaranteed to preserve distances
# Cons: No variance optimization like PCA
```

---

## **📦 PRODUCTION API EXAMPLE**

Here's how to structure your Flask API:

```python
from flask import Flask, request, jsonify
import faiss
import pickle
import numpy as np
from sentence_transformers import SentenceTransformer

app = Flask(__name__)

# Load resources at startup (once!)
print("Loading models...")
pca = pickle.load(open('pca_model.pkl', 'rb'))
index = faiss.read_index("index_256d.faiss")
index.nprobe = 10
model = SentenceTransformer('sentence-transformers/multi-qa-mpnet-base-dot-v1')
print("✅ Models loaded")

@app.route('/search', methods=['POST'])
def search():
    data = request.json
    query_text = data.get('query_text')
    k = data.get('k', 10)
    
    # Generate 768d embedding
    query_768d = model.encode([query_text])[0]
    
    # Reduce to 256d (CRITICAL STEP!)
    query_256d = pca.transform([query_768d])[0]
    
    # Prepare for FAISS
    query_vector = query_256d.astype('float32').reshape(1, -1)
    faiss.normalize_L2(query_vector)
    
    # Search
    distances, indices = index.search(query_vector, k)
    
    return jsonify({
        'indices': indices[0].tolist(),
        'distances': distances[0].tolist()
    })

@app.route('/search-with-embedding', methods=['POST'])
def search_with_embedding():
    """If user provides their own 768d embedding"""
    data = request.json
    query_768d = np.array(data['embedding'])  # User provides 768d
    k = data.get('k', 10)
    
    # Reduce to 256d
    query_256d = pca.transform([query_768d])[0]
    
    # Search
    query_vector = query_256d.astype('float32').reshape(1, -1)
    faiss.normalize_L2(query_vector)
    distances, indices = index.search(query_vector, k)
    
    return jsonify({
        'indices': indices[0].tolist(),
        'distances': distances[0].tolist()
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
```

---

## **🎯 KEY TAKEAWAYS**

1. **Always save your reduction model** (PCA/UMAP/etc.)
2. **Apply the SAME transformation to queries** - use `.transform()` not `.fit_transform()`
3. **Dimensions must match** - query and index must be same size
4. **Speed gains are real** - 2-3x faster search with 256d vs 768d
5. **Quality loss is minimal** - Usually retain 95%+ of information

---

## **✅ QUICK CHECKLIST**

Did you save these files?
- [ ] `embeddings_reduced.npy` (the 2.0GB file)
- [ ] `pca_model.pkl` (or whatever reduction method you used) ⚠️ **CRITICAL**
- [ ] Original embedding model name (e.g., `'multi-qa-mpnet-base-dot-v1'`)

If you didn't save the PCA model, you'll need to:
1. Go back to Colab
2. Reload original embeddings
3. Retrain PCA (get same random_state!)
4. Save the model this time

Want me to create a notebook that shows you exactly which model you used and how to save it?
