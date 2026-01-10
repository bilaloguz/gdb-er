
import os
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="GDBer SLM-RAG Service")

from vector_store import VectorStore
from ollama_client import OllamaClient

# Initialize Singletons
try:
    vector_store = VectorStore()
except Exception as e:
    logger.warning(f"VectorStore init failed: {e}")
    vector_store = None

ollama_client = OllamaClient()

class AnalyzeRequest(BaseModel):
    stack_trace: list
    exception_msg: str
    recent_logs: str
    project_root: str | None = None
    current_file: str | None = None

class IndexRequest(BaseModel):
    path: str

@app.post("/analyze_crash")
async def analyze_crash(req: AnalyzeRequest):
    logger.info(f"Analyzing crash: {req.exception_msg}")
    
    # 0. Auto-Index (Smart Context)
    if vector_store:
        try:
            # Use provided root or fallback to default
            idx_path = req.project_root or os.getenv("DEFAULT_INDEX_PATH", "/home/bso/Desktop/dev/gdber/demo_projects")
            vector_store.index_directory(idx_path)
        except Exception as e:
            logger.error(f"Auto-index failed: {e}")

    if not vector_store or not ollama_client.is_available():
        return {
            "explanation": "AI Service Not Ready (Ollama or VectorDB missing).",
            "suggested_fix": "Please check backend logs."
        }

    # 1. Retrieve Context
    context_snippets = []
    
    # A. Targeted Search (Crashing File)
    crash_file = None
    
    # Priority: Active File from Frontend > Stack Trace
    if req.current_file:
        crash_file = req.current_file
    elif req.stack_trace and isinstance(req.stack_trace[0], dict):
        # Frame usually has 'fullname' (absolute) or 'file' (relative)
        crash_file = req.stack_trace[0].get('fullname') or req.stack_trace[0].get('file')
        
    if crash_file:
        # Resolve to absolute path for exact matching with vector_store index
        # (which stores absolute paths)
        idx_path = req.project_root or os.getenv("DEFAULT_INDEX_PATH", "/home/bso/Desktop/dev/gdber/demo_projects")
        if not os.path.isabs(crash_file):
             crash_file = os.path.abspath(os.path.join(idx_path, crash_file))
             
        logger.info(f"Targeting crash file: {crash_file}")
        # Try to find chunks specifically from this file
        # We use a broad query "function causing crash" but restrict to this file
        file_snippets = vector_store.query_context(req.exception_msg, n_results=3, filename_filter=crash_file)
        if isinstance(file_snippets, list):
            logger.info(f"Found {len(file_snippets)} snippets in {crash_file}")
            context_snippets.extend(file_snippets)
        else:
            logger.info(f"No snippets found in {crash_file}")

    # B. Semantic Search (General)
    # If we didn't get enough context from the file, or just to be safe, add generic search
    if len(context_snippets) < 2:
        query = f"{req.exception_msg} "
        if req.stack_trace:
            query += str(req.stack_trace[0])
            
        generic_snippets = vector_store.query_context(query, n_results=2)
        if isinstance(generic_snippets, list):
             # Avoid duplicates
            for s in generic_snippets:
                if s not in context_snippets:
                    context_snippets.append(s)

    # wrap in list if single string returned (my vector_store.py returns single snippet string or list?)
    # checked vector_store.py: returns list[str] flat? Ah 'documents[0]'. 
    # It returns a list of strings (the documents list for the first query).
    if isinstance(context_snippets, str):
        context_snippets = [context_snippets]
        
    # 2. Ask AI
    result = ollama_client.generate_explanation(
        context_code=context_snippets, 
        stack_trace=req.stack_trace, 
        error_msg=req.exception_msg
    )
    
    # Merge context into result for frontend display
    if isinstance(result, dict):
        result["related_code"] = context_snippets
    
    return result

def run_indexing(path: str):
    if vector_store:
        count = vector_store.index_directory(path)
        logger.info(f"Background Indexing Complete: {count} files.")

@app.post("/index_codebase")
async def index_codebase(req: IndexRequest, background_tasks: BackgroundTasks):
    if not os.path.exists(req.path):
        raise HTTPException(status_code=404, detail="Path not found")
        
    logger.info(f"Indexing path: {req.path}")
    background_tasks.add_task(run_indexing, req.path)
    
    return {"status": "indexing_started", "job_id": "bg-task-1"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
