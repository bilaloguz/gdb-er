import asyncio
import websockets
import json
import os

async def test():
    uri = "ws://localhost:8001"
    exe_path = os.path.abspath("gdb_service/tests/test_prog")
    
    async with websockets.connect(uri) as websocket:
        print("Connected.")
        
        # 1. Init
        print(f"Initializing with {exe_path}")
        await websocket.send(json.dumps({"action": "init", "args": {"executable": exe_path}}))
        
        # 2. Break
        print("Setting breakpoint at main")
        await websocket.send(json.dumps({"action": "break", "args": {"location": "main"}}))
        
        # 3. Run
        print("Running...")
        await websocket.send(json.dumps({"action": "run"}))
        
        # Loop for responses
        while True:
            msg = await websocket.recv()
            data = json.loads(msg)
            print(f"Received: {data}")
            
            if data.get("type") == "stopped":
                reason = data["payload"]["reason"]
                print(f"Stopped due to: {reason}")
                if reason == "breakpoint-hit":
                     # 4. Next
                     print("Step over (next)...")
                     await websocket.send(json.dumps({"action": "next"}))
                elif reason == "end-stepping-range":
                     # 5. Inspect
                     print("Inspecting variable 'a'...")
                     await websocket.send(json.dumps({"action": "var_inspect", "args": {"name": "a"}}))
                     break 
            
            if data.get("type") == "output" and "Result:" in data["payload"]["content"]:
                 print("Program finished.")
                 break

if __name__ == "__main__":
    asyncio.run(test())
