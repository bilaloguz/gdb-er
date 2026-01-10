import os

# Service URLs
GDB_SERVICE_URL = os.getenv("GDB_SERVICE_URL", "ws://localhost:8001")
SLM_SERVICE_URL = os.getenv("SLM_SERVICE_URL", "http://localhost:8002")

# Application Defaults
DEFAULT_INDEX_PATH = os.getenv("DEFAULT_INDEX_PATH", "/home/bso/Desktop/dev/gdber/demo_projects")
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", 8000))

# Project Root (Restricted File Access)
PROJECT_ROOT = os.getenv("PROJECT_ROOT", "/home/bso/Desktop/dev/gdber/demo_projects")
