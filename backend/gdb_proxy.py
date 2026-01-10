import asyncio
import websockets
import json
import logging
from typing import Dict, Optional
from fastapi import WebSocket, WebSocketDisconnect

from settings import GDB_SERVICE_URL

logger = logging.getLogger(__name__)

class GDBProxy:
    def __init__(self, gdb_uri: str = GDB_SERVICE_URL):
        self.gdb_uri = gdb_uri
        self.gdb_ws: Optional[websockets.WebSocketClientProtocol] = None
        self.frontend_ws: Optional[WebSocket] = None
        self.running = False

    async def connect_gdb(self, session_id: str):
        try:
             # Append session ID to URL
            uri = f"{self.gdb_uri}/{session_id}"
            self.gdb_ws = await websockets.connect(uri)
            logger.info(f"Connected to GDB Service at {uri}")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to GDB Service: {e}")
            return False

    async def run(self, frontend_ws: WebSocket, session_id: str = "default"):
        self.frontend_ws = frontend_ws
        self.running = True
        
        if not await self.connect_gdb(session_id):
            await frontend_ws.close(code=1011, reason="GDB Service Unavailable")
            return

        # Start tasks to pump messages both ways
        receive_task = asyncio.create_task(self._forward_gdb_to_frontend())
        
        try:
            while self.running:
                # Receive from frontend
                data = await self.frontend_ws.receive_text()
                logger.info(f"Frontend -> Backend: {data}")
                
                # Forward to GDB
                if self.gdb_ws:
                    await self.gdb_ws.send(data)
                    
        except WebSocketDisconnect:
            logger.info("Frontend disconnected")
        except websockets.exceptions.ConnectionClosed:
            logger.info("GDB connection closed")
        except Exception as e:
            logger.error(f"Error in proxy loop: {e}")
        finally:
            self.running = False
            receive_task.cancel()
            if self.gdb_ws:
                await self.gdb_ws.close()
            logger.info("Proxy session ended")

    async def _forward_gdb_to_frontend(self):
        try:
            async for message in self.gdb_ws:
                logger.info(f"GDB -> Backend: {message}")
                if self.frontend_ws:
                    await self.frontend_ws.send_text(message)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Error forwarding GDB to Frontend: {e}")
            # If GDB dies, maybe close frontend?
