import asyncio
import websockets
import json

async def test_backend():
    uri = "ws://localhost:8000/ws/test-context-1"
    async with websockets.connect(uri) as websocket:
        print("Connected to Backend Proxy.")
        
        async def wait_for(token_id):
            while True:
                msg = await websocket.recv()
                data = json.loads(msg)
                if data.get("token") == token_id:
                     print(f"MATCHED TOKEN {token_id}: {data}")
                     return data
                elif data.get("type") == "console":
                     pass # ignore console spam
                else:
                     print(f"Ignored: {data}")
        
        # Init
        await websocket.send(json.dumps({
            "action": "init", 
            "args": {"executable": "/home/bso/Desktop/dev/gdber/gdb_service/tests/test_prog"}
        }))
        
        # Break & Run
        await websocket.send(json.dumps({"action": "break", "args": {"location": "main"}}))
        await websocket.send(json.dumps({"action": "run"}))
        
        # Wait for stop
        while True:
            msg = await websocket.recv()
            data = json.loads(msg)
            if data.get("type") == "notify" and data.get("message") == "stopped":
                print("Program Stopped.")
                break
        
        # Request Context
        print("Requesting Context...")
        await websocket.send(json.dumps({"action": "get_context"}))
        
        # Expect Token 101 (Stack) and 102 (Locals)
        await wait_for("101")
        await wait_for("102")

        print("SUCCESS: Context events received.")

if __name__ == "__main__":
    asyncio.run(test_backend())
