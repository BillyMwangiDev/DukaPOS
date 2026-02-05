
import sys
import os
import time

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

print("Starting imports...", file=sys.stderr)

modules = [
    "app.config",
    "app.database",
    "app.models",
    "app.auth_utils",
    "app.printer_service",
    "app.websocket_manager",
    "app.routers.products",
    "app.routers.inventory",
    "app.routers.transactions",
    "app.routers.mpesa",
    "app.routers.hardware",
    "app.routers.print_router",
    "app.routers.system",
    "app.routers.reports",
    "main"
]

for mod in modules:
    start = time.time()
    print(f"Importing {mod}...", end="", flush=True, file=sys.stderr)
    try:
        __import__(mod)
        print(f" Done ({time.time() - start:.2f}s)", file=sys.stderr)
    except Exception as e:
        print(f" FAILED: {e}", file=sys.stderr)
