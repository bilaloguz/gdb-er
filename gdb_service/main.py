import asyncio
import websockets
import json
import logging
from typing import Dict, Optional
from native_gdb import NativeGDBController

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Represents a single persistent GDB interaction
class GDBSession:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.wrapper = NativeGDBController()
        
        # Internal State
        self.status = "Ready" 
        self.stack = []
        self.variables = []
        self.location = None
        
        # Active WebSocket (only one allowed at a time for simplicity)
        self.websocket = None
        self.log_history = [] # Keep last N logs to replay on reconnect
        
        # Specific event loop for this session's GDB
        self.loop_task = asyncio.create_task(self.wrapper.run_event_loop(self.on_gdb_event))

    def to_dict(self):
        return {
            "type": "state_update",
            "payload": {
                "status": self.status,
                "location": self.location,
                "stack": self.stack,
                "variables": self.variables
            }
        }
        
    async def attach(self, ws):
        """Attaches a new websocket to this session."""
        if self.websocket:
            logger.info(f"Session {self.session_id} replacing existing connection")
            try:
                await self.websocket.close()
            except: pass
            
        self.websocket = ws
        
        # Send Immediate State Snapshot
        logger.info(f"Session {self.session_id} attached. Sending cached state.")
        await self.send_json(self.to_dict())
        
        # Replay logging history (optional, last 10?)
        for log_entry in self.log_history[-10:]:
             await self.send_json(log_entry)

    def detach(self):
        self.websocket = None
        logger.info(f"Session {self.session_id} detached (GDB keeps running)")

    async def send_json(self, data):
        if self.websocket:
            try:
                await self.websocket.send(json.dumps(data))
            except Exception as e:
                logger.warning(f"Failed to send to session {self.session_id}: {e}")
                self.websocket = None

    async def log(self, level, text):
        import datetime
        # Use UTC ISO format
        ts = datetime.datetime.now(datetime.timezone.utc).isoformat()
        msg = {
            "type": "log_event",
            "payload": {
                "level": level,
                "text": text,
                "timestamp": ts
            }
        }
        self.log_history.append(msg)
        if len(self.log_history) > 50: self.log_history.pop(0)
        await self.send_json(msg)

    async def on_gdb_event(self, event):
        if not event: return
        
        msg_type = event.get('type')
        msg = event.get('message')
        payload = event.get('payload', {})

        # 1. Console
        if msg_type == 'console':
            await self.send_json(event)
            return

        # 2. Notifications
        if msg_type == 'notify':
            if msg == 'running':
                self.status = "Running"
                self.location = None
                self.stack = [] 
                self.variables = []
                await self.send_json(self.to_dict())
                await self.log("info", "[Running]")
                
            elif msg == 'stopped':
                reason = payload.get('reason')
                
                if reason in ['exited-normally', 'exited']:
                    self.status = "Exited"
                    self.location = None
                    self.stack = []
                    self.variables = []
                    await self.send_json(self.to_dict())
                    await self.log("info", f"[Exited] Reason: {reason}")
                else:
                    self.status = "Paused"
                    
                    frame = payload.get('frame', {})
                    if frame:
                        self.location = {
                            "file": frame.get('file'),
                            "line": frame.get('line'),
                            "func": frame.get('func')
                        }
                    
                    await self.send_json(self.to_dict())
                    
                    log_text = f"[Paused] {reason}"
                    if self.location:
                         log_text += f" at {self.location.get('file')}:{self.location.get('line')}"
                    await self.log("info", log_text)

                    # Auto-Fetch Context
                    await self.wrapper.write("101-stack-list-frames")
                    await self.wrapper.write("102-stack-list-locals --simple-values")

        # 3. Results
        elif msg_type == 'result':
            token = event.get('token')
            
            if token == 101: # Stack
                self.stack = payload.get('stack', [])
                await self.send_json(self.to_dict())
                
            elif token == 102: # Locals
                self.variables = payload.get('locals', [])
                await self.send_json(self.to_dict())

            elif token == 201: # Breakpoint Created
                bkpt = payload.get('bkpt', {})
                if bkpt:
                    await self.send_json({
                        "type": "breakpoint_created",
                        "payload": {
                            "id": bkpt.get('number'),
                            "file": bkpt.get('fullname') or bkpt.get('file'), 
                            "line": bkpt.get('line')
                        }
                    })

            # Feature 2: Variable Inspection
            elif token == 301: # var-create
                await self.send_json({
                    "type": "var_created",
                    "payload": {
                        "name": payload.get('name'), 
                        "numchild": payload.get('numchild'),
                        "value": payload.get('value'),
                        "type": payload.get('type'),
                    }
                })

            elif token == 302: # var-list-children
                await self.send_json({
                    "type": "var_children",
                    "payload": {
                        "children": payload.get('children', []),
                    }
                })
            
            elif token == 401: # Memory read
                mem = payload.get('memory', [])
                contents = ""
                address = "0x0"
                if mem:
                    contents = "".join([m.get('contents', '') for m in mem])
                    address = mem[0].get('begin', '0x0')
                
                await self.send_json({
                    "type": "memory_read",
                    "payload": {
                        "address": address,
                        "contents": contents
                    }
                })

            # Error Handling
            if payload.get('msg') and not payload.get('bkpt') and not payload.get('name') and not payload.get('children'):
                 error_msg = payload.get('msg')
                 await self.log("error", f"GDB Error: {error_msg}")
                 await self.send_json({"type": "error", "payload": error_msg})

            elif msg == 'error':
                error_msg = payload.get('msg', 'Unknown Error')
                await self.log("error", f"Error: {error_msg}")
                await self.send_json({"type": "error", "payload": error_msg})

    async def handle_command(self, action, args):
        if action == "init":
            exe = args.get("executable")
            try:
                await self.wrapper.start(exe)
                self.status = "Ready"
                self.stack = []
                self.variables = []
                await self.send_json(self.to_dict())
            except Exception as e:
                await self.log("error", f"Failed to start GDB: {str(e)}")
                await self.send_json({"type": "error", "payload": f"Startup Failed: {str(e)}"})
            
        elif action == "stop":
            await self.wrapper.stop()
            self.status = "Ready"
            await self.send_json(self.to_dict())
            
        else:
            cmd = action
            if action == "run": 
                stop_at_entry = args.get("stop_at_entry", False)
                cmd = "-exec-run --start" if stop_at_entry else "-exec-run"
            elif action == "next": cmd = "-exec-next"
            elif action == "step": cmd = "-exec-step"
            elif action == "continue": cmd = "-exec-continue"
            elif action == "break": 
                cmd = f"201-break-insert {args.get('location')}" 
            elif action == "remove_breakpoint":
               cmd = f"-break-delete {args.get('id')}"
            
            # Variables
            elif action == "var_create":
                cmd = f"301-var-create - * {args.get('expression')}"
            elif action == "var_list_children":
                cmd = f"302-var-list-children --all-values {args.get('name')}"
            
            # Memory
            elif action == "read_memory":
                address = args.get('address')
                count = args.get('count', 256)
                cmd = f"401-data-read-memory-bytes {address} {count}"

            elif action == "get_context":
                await self.wrapper.write("101-stack-list-frames")
                await self.wrapper.write("102-stack-list-locals --simple-values")
                return

            await self.wrapper.write(cmd)


# Global Session Registry
class SessionManager:
    def __init__(self):
        self.sessions: Dict[str, "GDBSession"] = {}

    def get_or_create(self, session_id: str):
        if session_id not in self.sessions:
            logger.info(f"Creating new GDB Session: {session_id}")
            self.sessions[session_id] = GDBSession(session_id)
        return self.sessions[session_id]

    def remove(self, session_id: str):
        if session_id in self.sessions:
            del self.sessions[session_id]

session_manager = SessionManager()

async def handler(websocket):
    # Extract session_id from request path (websockets lib passes path in request? No.)
    # The 'serve' handler passes just the websocket.
    # We need to parse the URI from websocket.path
    
    path = websocket.request.path
    session_id = "default"
    if len(path) > 1:
        session_id = path.strip("/")
    
    logger.info(f"Incoming connection for session: {session_id}")
    
    session = session_manager.get_or_create(session_id)
    await session.attach(websocket)

    try:
        async for message in websocket:
            data = json.loads(message)
            action = data.get("action")
            args = data.get("args", {})
            
            await session.handle_command(action, args)
            
    except websockets.exceptions.ConnectionClosed:
        logger.info(f"Connection closed for {session_id}")
    finally:
        session.detach()

async def main():
    import signal
    loop = asyncio.get_running_loop()
    stop = loop.create_future()
    loop.add_signal_handler(signal.SIGTERM, stop.set_result, None)
    
    logger.info("Starting GDB Service on localhost:8001")
    async with websockets.serve(handler, "localhost", 8001):
        await stop 

if __name__ == "__main__":
    asyncio.run(main())
