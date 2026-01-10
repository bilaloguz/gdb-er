#!/bin/bash

# GDBer - Run All Services
# This script starts the Backend, GDB Service, SLM RAG Service, and Frontend concurrently.

# Function to kill all child processes on script exit
cleanup() {
    echo "Stopping all services..."
    kill $(jobs -p) 2>/dev/null
    wait
    echo "All services stopped."
}

# Trap SIGINT and SIGTERM to run cleanup
trap cleanup SIGINT SIGTERM

# Activate Virtual Environment
if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "Virtual environment 'venv' not found. Please create it first."
    exit 1
fi

# Function to kill processes on specific ports
kill_existing() {
    echo "Checking for existing processes..."
    ports=(8000 8001 8002 5173)
    for port in "${ports[@]}"; do
        # Try lsof First
        if command -v lsof >/dev/null 2>&1; then
            pid=$(lsof -ti:$port)
            if [ -n "$pid" ]; then
                echo "Killing process on port $port (PID: $pid)"
                kill -9 $pid 2>/dev/null
            fi
        # Fallback to fuser
        elif command -v fuser >/dev/null 2>&1; then
             fuser -k -n tcp $port >/dev/null 2>&1
        fi
    done
}

# Run pre-cleanup
kill_existing

echo "Starting GDBer Services..."

# 1. Start Backend (Port 8000)
echo "[Backend] Starting on port 8000..."
python3 backend/main.py &
BACKEND_PID=$!

# 2. Start GDB Service (Port 8001)
echo "[GDB Service] Starting on port 8001..."
python3 gdb_service/main.py &
GDB_PID=$!

# 3. Start SLM RAG Service (Port 8002)
# Ensure Local Ollama is running on port 11435 (custom port to avoid conflicts)
export OLLAMA_HOST=127.0.0.1:11435
# Check if port 11435 is in use
if ! lsof -i :11435 > /dev/null; then
    echo "[Ollama] Starting local instance on port 11435..."
    ./slm_rag/bin/ollama serve > ollama.log 2>&1 &
    # Allow some time for startup
    sleep 2
else
    echo "[Ollama] Already running on port 11435."
fi

echo "[SLM RAG] Starting on port 8002..."
python3 slm_rag/main.py &
RAG_PID=$!

# 4. Start Frontend
echo "[Frontend] Starting..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo "All services started. Press Ctrl+C to stop."

# Wait for all background processes
wait
