import asyncio
import websockets
import json

async def test_backend():
    uri = "ws://localhost:8000/ws/test-session-123"
    async with websockets.connect(uri) as websocket:
        print("Connected to Backend Proxy.")
        
        # Helper to read until a specific message type
        async def wait_for(msg_type):
            while True:
                msg = await websocket.recv()
                data = json.loads(msg)
                print(f"Received: {data}")
                if data.get("type") == msg_type:
                    return data
        
        # 1. Init (Backend should forward this to GDB)
        # Note: GDB Service (native_gdb) doesn't use 'init' message anymore really, 
        # it just starts GDB on connection? 
        # Wait, native_gdb doesn't auto-start GDB on connection. 
        # main.py handler waits for "init" command with executable path!
        # Correct.
        
        print("Sending 'init'...")
        await websocket.send(json.dumps({
            "action": "init", 
            "args": {"executable": "/home/bso/Desktop/dev/gdber/gdb_service/tests/test_prog"}
        }))
        
        # 2. Break
        print("Sending 'break'...")
        await websocket.send(json.dumps({
            "action": "break", 
            "args": {"location": "main"}
        }))
        
        # 3. Run
        print("Sending 'run'...")
        await websocket.send(json.dumps({
            "action": "run"
        }))
        
        # Expect 'stopped'
        print("Waiting for stop...")
        await wait_for("stopped")
        print("SUCCESS: GDB Stopped event received via Proxy.")

if __name__ == "__main__":
    asyncio.run(test_backend())
