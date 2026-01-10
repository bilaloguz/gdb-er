import requests
import logging

logger = logging.getLogger(__name__)

from settings import SLM_SERVICE_URL

class SLMClient:
    def __init__(self, slm_url: str = SLM_SERVICE_URL):
        self.slm_url = slm_url

    def analyze_crash(self, stack_trace, exception_msg, recent_logs, project_root=None, current_file=None):
        try:
            payload = {
                "stack_trace": stack_trace,
                "exception_msg": exception_msg,
                "recent_logs": recent_logs,
                "project_root": project_root,
                "current_file": current_file
            }
            # Increased timeout for local CPU inference
            resp = requests.post(f"{self.slm_url}/analyze_crash", json=payload, timeout=120)
            resp.raise_for_status()
            return resp.json()
            # Increased timeout for local CPU inference
            resp = requests.post(f"{self.slm_url}/analyze_crash", json=payload, timeout=120)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.error(f"SLM analysis failed: {e}")
            return {"explanation": "Analysis unavailable", "suggested_fix": ""}

    def index_codebase(self, path: str) -> dict:
        try:
            resp = requests.post(f"{self.slm_url}/index_codebase", json={"path": path}, timeout=10)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.error(f"SLM indexing failed: {e}")
            return {"status": "error", "message": str(e)}
