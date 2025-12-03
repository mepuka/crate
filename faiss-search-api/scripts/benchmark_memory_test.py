import faiss
import numpy as np
import os
import psutil
import time
import tempfile

def get_memory_usage():
    process = psutil.Process(os.getpid())
    return process.memory_info().rss / 1024 / 1024  # MB

def benchmark():
    # Parameters
    d = 384
    nb = 100_000  # 100k vectors for test (scale up mentally to 2.2M)
    
    print(f"Generating {nb} vectors of dim {d}...")
    xb = np.random.random((nb, d)).astype('float32')
    
    # Create index
    index = faiss.IndexFlatL2(d)
    index.add(xb)
    
    # Save to temp file
    tmp_file = tempfile.mktemp(suffix=".index")
    faiss.write_index(index, tmp_file)
    print(f"Index saved to {tmp_file} ({os.path.getsize(tmp_file) / 1024 / 1024:.2f} MB)")
    
    # Baseline memory
    base_mem = get_memory_usage()
    print(f"Baseline memory: {base_mem:.2f} MB")
    
    # Test 1: Load fully into RAM
    print("\n--- Test 1: Load fully into RAM ---")
    start = time.time()
    index_ram = faiss.read_index(tmp_file)
    ram_mem = get_memory_usage()
    print(f"Load time: {time.time() - start:.4f}s")
    print(f"Memory usage: {ram_mem:.2f} MB (Delta: {ram_mem - base_mem:.2f} MB)")
    del index_ram
    
    # Test 2: Load with MMAP
    print("\n--- Test 2: Load with MMAP ---")
    start = time.time()
    index_mmap = faiss.read_index(tmp_file, faiss.IO_FLAG_MMAP)
    mmap_mem = get_memory_usage()
    print(f"Load time: {time.time() - start:.4f}s")
    print(f"Memory usage: {mmap_mem:.2f} MB (Delta: {mmap_mem - ram_mem:.2f} MB)") # Should be close to 0 delta from previous step (which was high? wait, I deleted index_ram)
    # Actually compare to baseline
    print(f"Memory usage vs Baseline: {mmap_mem - base_mem:.2f} MB")
    
    # Cleanup
    if os.path.exists(tmp_file):
        os.remove(tmp_file)

if __name__ == "__main__":
    benchmark()
