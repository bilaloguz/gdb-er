import requests
import logging
import json

logger = logging.getLogger(__name__)

class OllamaClient:
    def __init__(self, base_url: str = "http://localhost:11435", model: str = "qwen2.5-coder:1.5b"):
        self.base_url = base_url
        self.model = model

    def is_available(self) -> bool:
        try:
            resp = requests.get(f"{self.base_url}/api/tags", timeout=2)
            return resp.status_code == 200
        except:
            return False

    def generate_explanation(self, context_code: list, stack_trace: list, error_msg: str) -> dict:
        """
        Generates an explanation and fix using Ollama.
        Returns a dict: {'explanation': str, 'suggested_fix': str}
        """
        
        # specific instructions to force JSON output if possible, or structured text
        prompt = f"""
You are a Senior C/C++ Systems Engineer.
The user is debugging a crash with GDB. Analyze the provided Stack Trace and Source Code.

CRASH REASON: {error_msg}

STACK TRACE:
{json.dumps(stack_trace, indent=2)}

SOURCE CODE (Locally Indexed):
---
{"\n---\n".join(context_code)}
---

TASK:
1. Ignore standard library files (e.g., stdio-common, libc.so). Focus ONLY on the user's source code (e.g., .c files in the project).
2. Identify the *exact* runtime error (e.g., Buffer Overflow, Null Pointer, Use-After-Free).
3. Pinpoint the culprit line number in the USER's code.
4. Provide the corrected C code.

RESPONSE FORMAT (Strict JSON):
{{
  "explanation": "Concise technical diagnosis. blame the user's code, not libc.",
  "suggested_fix": "Corrected code snippet for the user's function."
}}
"""
        
        payload = {
            "model": self.model,
            "stream": False,
            "format": "json", # Force JSON mode (Ollama feature)
            "messages": [
                { "role": "system", "content": "You are a helpful low-level debugging assistant." },
                { "role": "user", "content": prompt }
            ]
        }
        
        try:
            # Increased timeout for local models
            resp = requests.post(f"{self.base_url}/api/chat", json=payload, timeout=90)
            resp.raise_for_status()
            data = resp.json()
            
            content = data.get("message", {}).get("content", "{}")
            logger.info(f"Ollama Raw Response: {content}")
            
            try:
                parsed = json.loads(content)
                return parsed
            except json.JSONDecodeError:
                # Fallback if model didn't output strict JSON
                return {
                    "explanation": content,
                    "suggested_fix": "See explanation."
                }
                
        except Exception as e:
            logger.error(f"Ollama generation failed: {e}")
            return {
                "explanation": f"AI unavailable ({str(e)}). Is Ollama running?",
                "suggested_fix": "Check network/variables manually."
            }
