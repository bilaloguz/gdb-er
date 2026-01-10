import pty
import os
import subprocess
import time
import select

def test_pty():
    print("Opening PTY...")
    master, slave = pty.openpty()
    
    print("Spawning GDB...")
    # forcing unbuffered just in case, though PTY should handle it
    p = subprocess.Popen(
        ["gdb", "--nx", "--quiet", "--interpreter=mi3"], 
        stdin=slave, 
        stdout=slave, 
        stderr=slave, 
        close_fds=True
    )
    os.close(slave)
    
    print("GDB Spawned. PID:", p.pid)
    time.sleep(1)

    # Write a command
    print("Writing -list-features...")
    os.write(master, b"-list-features\n")
    
    # Read loop
    print("Reading...")
    start = time.time()
    while time.time() - start < 5:
        r, _, _ = select.select([master], [], [], 0.5)
        if r:
            try:
                data = os.read(master, 1024)
                if not data: break
                print(f"RAW DATA: {data}")
            except OSError:
                break
        
    print("Done reading.")
    p.terminate()
    p.wait()

if __name__ == "__main__":
    test_pty()
