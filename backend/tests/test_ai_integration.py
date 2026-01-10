import requests
import json

def test_analyze():
    url = "http://localhost:8000/api/analyze"
    payload = {
        "stack_trace": ["main.c:15", "libc..."],
        "exception_msg": "SIGSEGV",
        "recent_logs": "Program started..."
    }
    
    print(f"Sending request to {url}...")
    try:
        resp = requests.post(url, json=payload)
        resp.raise_for_status()
        print("Response:", json.dumps(resp.json(), indent=2))
    except Exception as e:
        print(f"FAILED: {e}")

if __name__ == "__main__":
    test_analyze()
