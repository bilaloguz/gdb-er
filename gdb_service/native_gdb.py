import asyncio
import logging
import re
import pty
import os
import subprocess
import select
import signal

logger = logging.getLogger(__name__)

class NativeGDBController:
    def __init__(self):
        self.process = None
        self.running = True # Allow loop to start and wait for FD
        self.master_fd = None

    async def start(self, executable=None):
        self.master_fd, slave_fd = pty.openpty()
        
        # Disable debuginfod to avoid interactive prompts
        cmd = ["gdb", "--nx", "--quiet", "--interpreter=mi3", "--eval-command=set debuginfod enabled off"]
        if executable:
            if not os.path.exists(executable):
                raise FileNotFoundError(f"Binary not found: {executable}")
            cmd.append(executable)
        
        logger.info(f"Starting GDB (PTY) with: {cmd}")
        try:
            self.process = subprocess.Popen(
                cmd,
                stdin=slave_fd,
                stdout=slave_fd,
                stderr=slave_fd,
                start_new_session=True, # setsid
                close_fds=True
            )
        except Exception as e:
            os.close(slave_fd)
            if self.master_fd: os.close(self.master_fd)
            raise e

        os.close(slave_fd)
        self.running = True

    async def stop(self):
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=1)
            except Exception as e:
                logger.error(f"Error stopping GDB: {e}")
                try: os.kill(self.process.pid, signal.SIGKILL)
                except: pass
            self.process = None
            
        if self.master_fd:
            try: os.close(self.master_fd)
            except: pass
            self.master_fd = None
        self.running = False

    async def write(self, command: str):
        if self.master_fd:
            logger.info(f"GDB WRITE: {command}")
            os.write(self.master_fd, f"{command}\n".encode())

    async def run_event_loop(self, on_event):
        logger.info("Starting Native GDB event loop (PTY+select)")
        
        buffer = b""
        
        while self.running:
            if not self.master_fd:
                await asyncio.sleep(0.1)
                continue
            
            # Use run_in_executor for the blocking select call to avoid blocking the asyncio loop
            r, _, _ = await asyncio.to_thread(select.select, [self.master_fd], [], [], 0.5)
            
            if self.master_fd in r:
                try:
                    chunk = os.read(self.master_fd, 4096)
                    if not chunk: # EOF
                         break
                    
                    # logger.info(f"READ CHUNK: {chunk}")
                    buffer += chunk
                    
                    while b'\n' in buffer:
                        line_bytes, buffer = buffer.split(b'\n', 1)
                        line_str = line_bytes.decode(errors='replace').strip()
                        logger.info(f"GDB RAW: {line_str}")
                        
                        parsed = self._parse_line(line_str)
                        if parsed:
                            await on_event(parsed)
                            
                except OSError:
                     logger.info("PTY closed")
                     break
                except Exception as e:
                    logger.error(f"Error in read loop: {e}")
            else:
                # Timeout, check if we should stop or just yield
                await asyncio.sleep(0) # yield


    def _parse_line(self, line):
        from pygdbmi.gdbmiparser import parse_response
        try:
            parsed = parse_response(line)
            if not parsed: return None
            
            # Map types
            if parsed['type'] == 'console':
                 content = parsed['payload']
                 if content:
                     content = content.replace(r'\"', '"').replace(r'\n', '\n')
                     return {"type": "console", "payload": content}
                 return None
            
            elif parsed['type'] == 'notify':
                 return {"type": "notify", "message": parsed['message'], "payload": parsed['payload']}
            
            elif parsed['type'] == 'result':
                 msg = parsed['message']
                 payload = parsed['payload']
                 token = parsed['token']
                 
                 if isinstance(payload, dict):
                     if 'stack' in payload: msg = 'stack'
                     elif 'locals' in payload: msg = 'locals'
                 
                 res = {"type": "result", "message": msg, "payload": payload}
                 if token: res['token'] = token
                 return res
            
            elif parsed['type'] == 'output': 
                 return None
                 
            return parsed
        except:
            return None
