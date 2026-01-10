import chromadb
from chromadb.utils import embedding_functions
import os
import glob
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)

class VectorStore:
    def __init__(self, persistence_path: str = "./chroma_db"):
        self.client = chromadb.PersistentClient(path=persistence_path)
        
        # Use a standard lightweight model for embeddings
        self.embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name="all-MiniLM-L6-v2"
        )
        
        self.collection = self.client.get_or_create_collection(
            name="codebase",
            embedding_function=self.embedding_fn
        )
        self.mtimes_path = os.path.join(persistence_path, "mtimes.json")
        self.file_mtimes = self._load_mtimes()

    def _load_mtimes(self):
        if os.path.exists(self.mtimes_path):
            try:
                import json
                with open(self.mtimes_path, 'r') as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load mtimes cache: {e}")
        return {}

    def _save_mtimes(self):
        try:
            import json
            with open(self.mtimes_path, 'w') as f:
                json.dump(self.file_mtimes, f)
        except Exception as e:
            logger.error(f"Failed to save mtimes cache: {e}")

    def index_directory(self, root_path: str, glob_pattern: str = "**/*.c"):
        """Reads files, chunks by function, and indexes into ChromaDB."""
        files = glob.glob(os.path.join(root_path, glob_pattern), recursive=True)
        # logger.info(f"Found {len(files)} files to index in {root_path}")
        
        if not files:
            return 0

        ids = []
        documents = []
        metadatas = []
        
        files_processed = 0

        for i, file_path in enumerate(files):
            try:
                # 1. Check mtime for incremental update
                current_mtime = os.path.getmtime(file_path)
                if file_path in self.file_mtimes and self.file_mtimes[file_path] == current_mtime:
                    # File hasn't changed, skip re-embedding
                    continue

                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    if not content.strip():
                        continue
                    
                    chunks = self._extract_functions(content)
                    
                    for chunk in chunks:
                        # ID format: filepath::funcname
                        chunk_id = f"{file_path}::{chunk['name']}"
                        
                        ids.append(chunk_id)
                        documents.append(chunk['content'])
                        metadatas.append({
                            "source": file_path,
                            "type": chunk['type'],
                            "name": chunk['name']
                        })
                
                # Update Cache
                self.file_mtimes[file_path] = current_mtime
                files_processed += 1
                        
            except Exception as e:
                logger.error(f"Failed to read/parse {file_path}: {e}")

        if documents:
            # Batch upsert
            batch_size = 50
            for i in range(0, len(documents), batch_size):
                end = min(i + batch_size, len(documents))
                self.collection.upsert(
                    ids=ids[i:end],
                    documents=documents[i:end],
                    metadatas=metadatas[i:end]
                )
                
            logger.info(f"Incremental Index: Updated {files_processed} files ({len(documents)} chunks).")
        
        if files_processed > 0:
            self._save_mtimes()
            
        return files_processed

    def query_context(self, query_text: str, n_results: int = 3, filename_filter: str = None) -> List[str]:
        """Finds relevant code snippets for the given query."""
        
        where_clause = None
        if filename_filter:
            # Filter where "source" contains the filename (partial match to handle paths)
            # ChromaDB 'where' filtering. Using $contains if available or exact match if path known.
            # Since we store absolute paths in "source", and stack trace might be relative or just filename, 
            # exact match is risky. But Chroma JSON queries are limited.
            # Let's try matching the exact "source" if we can construct it, or rely on client filtering?
            # actually better: query generic, then if we have filename, try to find chunks specifically for that file
            pass

        # Chroma doesn't support $contains for string metadata easily in standard query interface without exact regex or similar
        # simpler: if filename_filter provided, we want to prioritize it.
        # But let's stick to standard semantic search first, maybe the issue is simply that we didn't use the filename in the query text strongly enough?
        
        # Let's try explicit filtering if possible
        # "source" metadata holds the file path.
        if filename_filter:
             # Just query everything for that file?
             # No, we combine. 
             # Let's strict filter: if we know the file, ONLY look at that file? 
             # Maybe too restrictive.
             # Let's just Add the filename to the query text!
             logger.info(f"Querying vector store with filename filter: {filename_filter}")

        results = self.collection.query(
            query_texts=[query_text],
            n_results=n_results,
            where={"source": {"$eq": filename_filter}} if filename_filter else None
        )
        
        # Flatten results
        return results['documents'][0] if results['documents'] else []

        self.collection = self.client.create_collection(
            name="codebase",
            embedding_function=self.embedding_fn
        )

    def _extract_functions(self, content: str) -> List[Dict]:
        """
        Simple C function extractor using heuristics/regex.
        Splits by brace balancing for top-level functions.
        """
        chunks = []
        lines = content.split('\n')
        buffer = []
        brace_balance = 0
        in_function = False
        func_name = "unknown"
        
        for line in lines:
            stripped = line.strip()
            
            # Very basic detection of function start (e.g., "void foo() {")
            # This is fragile but works for demo C files
            if not in_function and '{' in line and '(' in line and not line.startswith(('if', 'for', 'while', 'switch')):
                in_function = True
                buffer = [line]
                brace_balance = line.count('{') - line.count('}')
                
                # Guess name
                parts = line.split('(')[0].split()
                if parts:
                    func_name = parts[-1].replace('*', '')
                continue

            if in_function:
                buffer.append(line)
                brace_balance += line.count('{') - line.count('}')
                
                if brace_balance <= 0:
                    # End of function
                    in_function = False
                    chunks.append({
                        "name": func_name,
                        "type": "function",
                        "content": "\n".join(buffer)
                    })
                    buffer = []
        
        return chunks
