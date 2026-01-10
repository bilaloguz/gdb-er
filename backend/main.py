from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging
from gdb_proxy import GDBProxy

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="GDBer Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "GDBer Backend is running"}

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    logger.info(f"Frontend connected: Session {session_id}")
    
    # In a real app we'd map session_id to specific GDB instances
    proxy = GDBProxy()
    await proxy.run(websocket, session_id)

from pydantic import BaseModel
from slm_client import SLMClient

# ... existing code ...

class AnalysisRequest(BaseModel):
    stack_trace: list
    exception_msg: str
    recent_logs: str
    current_file: str | None = None

@app.post("/api/analyze")
async def analyze_crash_endpoint(req: AnalysisRequest):
    client = SLMClient()
    # Pass current project root to ensure AI looks at the right code
    current_root = getattr(app.state, "project_root", None)
    return client.analyze_crash(req.stack_trace, req.exception_msg, req.recent_logs, current_root, req.current_file)

from settings import DEFAULT_INDEX_PATH, API_HOST, API_PORT

# ... (rest of imports)

class IndexRequest(BaseModel):
    path: str = DEFAULT_INDEX_PATH

@app.post("/api/index")
async def index_codebase_endpoint(req: IndexRequest):
    client = SLMClient()
    return client.index_codebase(req.path)

# -----------------
# File System APIs
# -----------------
from settings import PROJECT_ROOT
import os

@app.on_event("startup")
async def startup_event():
    app.state.project_root = PROJECT_ROOT

class ProjectRequest(BaseModel):
    path: str

@app.post("/api/files/root")
async def set_project_root(req: ProjectRequest):
    if not os.path.isdir(req.path):
        raise HTTPException(status_code=400, detail="Path is not a directory")
    app.state.project_root = req.path
    logger.info(f"Project Root changed to: {req.path}")
    
    # Notify SLM to switch/re-index immediately
    try:
        client = SLMClient()
        client.index_codebase(req.path)
    except Exception as e:
        logger.error(f"Failed to trigger re-index on root change: {e}")
        
    return {"status": "ok", "path": req.path}

@app.get("/api/files/tree")
async def get_file_tree():
    """Returns the file structure of current project_root."""
    root_path = app.state.project_root
    tree = []
    
    if not os.path.exists(root_path):
         return {"root": root_path, "tree": [], "error": "Path does not exist"}

    # Simple recursive walker
    for root, dirs, files in os.walk(root_path):
        # Filter hidden
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        files = [f for f in files if not f.startswith('.')]
        
        # Build relative path
        rel_path = os.path.relpath(root, root_path)
        if rel_path == ".": rel_path = ""
        
        tree.append({
            "path": rel_path,
            "dirs": dirs,
            "files": files
        })
    return {"root": root_path, "tree": tree}

class LsRequest(BaseModel):
    path: str

@app.post("/api/files/ls")
async def list_directory(req: LsRequest):
    """Lists folders and files in a specific directory (non-recursive)."""
    target = req.path
    if not os.path.isdir(target):
        return {"error": "Not a directory", "path": target, "entries": []}
    
    entries = []
    try:
        with os.scandir(target) as it:
            for entry in it:
                if entry.name.startswith('.'): continue
                entries.append({
                    "name": entry.name,
                    "is_dir": entry.is_dir(),
                    "path": entry.path
                })
    except PermissionError:
        return {"error": "Permission denied", "path": target, "entries": []}
        
    # Sort: Dirs first, then files
    entries.sort(key=lambda x: (not x['is_dir'], x['name']))
    return {"path": target, "entries": entries, "parent": os.path.dirname(target)}

@app.get("/api/files/content")
async def get_file_content(path: str):
    """
    Reads a file from current project_root.
    Prevent path traversal logic.
    Enforce security checks (size limit, sensitive files).
    """
    current_root = app.state.project_root
    
    # Security Check
    safe_root = os.path.abspath(current_root)
    target_path = os.path.abspath(os.path.join(safe_root, path))
    
    if not target_path.startswith(safe_root):
        raise HTTPException(status_code=403, detail="Access denied: Path outside project root")
        
    if not os.path.exists(target_path):
         raise HTTPException(status_code=404, detail="File not found")

    # 1. Sensitive File Blocklist
    filename = os.path.basename(target_path)
    sensitive_extensions = {".env", ".pem", ".key", ".cert", ".crt"}
    sensitive_names = {"id_rsa", "id_dsa", "secrets.json", "dsa_key", "rsa_key"}
    
    _, ext = os.path.splitext(filename)
    if filename in sensitive_names or ext in sensitive_extensions or filename.startswith(".env"):
        logger.warning(f"Blocked access to sensitive file: {filename}")
        raise HTTPException(status_code=403, detail="Access denied: Sensitive file")

    # 2. Max File Size Limit (1MB)
    MAX_SIZE = 1 * 1024 * 1024 # 1MB
    if os.path.getsize(target_path) > MAX_SIZE:
        logger.warning(f"Blocked access to large file: {filename} ({os.path.getsize(target_path)} bytes)")
        raise HTTPException(status_code=400, detail="File too large (max 1MB)")
         
    try:
        with open(target_path, 'r', encoding='utf-8') as f:
            return {"content": f.read()}
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host=API_HOST, port=API_PORT)
