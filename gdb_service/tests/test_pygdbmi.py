from pygdbmi.gdbcontroller import GdbController
import time

def test():
    print("Starting GDB Controller...")
    gdb = GdbController(command=["gdb", "--nx", "--quiet", "--interpreter=mi3"])
    print("GDB Started.")
    
    print("Writing -exec-run...")
    gdb.write("-exec-run") # Will fail if no target, but should return error
    
    start = time.time()
    while time.time() - start < 5:
        print("Polling...")
        resp = gdb.get_gdb_response(timeout_sec=0.1, raise_error_on_timeout=False)
        if resp:
            print(f"Response: {resp}")
        time.sleep(0.5)

    gdb.exit()

if __name__ == "__main__":
    test()
