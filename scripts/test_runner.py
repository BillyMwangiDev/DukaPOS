#!/usr/bin/env python3
"""
DukaPOS Unified Test Runner
Runs both backend (pytest) and frontend (vitest) tests in sequence.
Usage: python scripts/test_runner.py
"""
import subprocess
import sys
import os
from pathlib import Path

# Colors for terminal output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"
BOLD = "\033[1m"

def run_command(cmd: list, cwd: str, name: str) -> bool:
    """Run a command and return True if successful."""
    print(f"\n{BOLD}{YELLOW}{'='*60}{RESET}")
    print(f"{BOLD}Running: {name}{RESET}")
    print(f"{YELLOW}Command: {' '.join(cmd)}{RESET}")
    print(f"{YELLOW}Directory: {cwd}{RESET}")
    print(f"{YELLOW}{'='*60}{RESET}\n")
    
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            shell=True if os.name == 'nt' else False,
            capture_output=False,
        )
        if result.returncode == 0:
            print(f"\n{GREEN}[PASS] {name}{RESET}")
            return True
        else:
            print(f"\n{RED}[FAIL] {name} (exit code {result.returncode}){RESET}")
            return False
    except Exception as e:
        print(f"\n{RED}[ERROR] {name}: {e}{RESET}")
        return False


def main():
    """Run all DukaPOS tests."""
    repo_root = Path(__file__).parent.parent.resolve()
    
    print(f"{BOLD}{'='*60}{RESET}")
    print(f"{BOLD}DukaPOS Unified Test Runner{RESET}")
    print(f"Repository: {repo_root}")
    print(f"{BOLD}{'='*60}{RESET}")
    
    results = {}
    
    # 1. Backend pytest tests
    backend_dir = repo_root / "backend"
    if (backend_dir / "tests").exists():
        results["Backend (pytest)"] = run_command(
            [sys.executable, "-m", "pytest", "tests", "-v", "--tb=short", "-W", "ignore"],
            str(backend_dir),
            "Backend (pytest)"
        )
    else:
        print(f"{YELLOW}[WARN] Backend tests directory not found, skipping{RESET}")
        results["Backend (pytest)"] = None
    
    # 2. Frontend vitest tests
    renderer_dir = repo_root / "electron" / "src" / "renderer"
    package_json = renderer_dir / "package.json"
    if package_json.exists():
        # Check if there are actual test files
        test_dir = renderer_dir / "src" / "test"
        if test_dir.exists() and any(test_dir.glob("*.test.*")):
            results["Frontend (vitest)"] = run_command(
                ["npm", "run", "test"],
                str(renderer_dir),
                "Frontend (vitest)"
            )
        else:
            print(f"{YELLOW}[WARN] No frontend test files found, skipping{RESET}")
            results["Frontend (vitest)"] = None
    else:
        print(f"{YELLOW}[WARN] Frontend package.json not found, skipping{RESET}")
        results["Frontend (vitest)"] = None
    
    # 3. TestSprite tests (if backend is running)
    testsprite_dir = repo_root / "testsprite_tests"
    if (testsprite_dir / "run_all_tests.py").exists():
        print(f"\n{YELLOW}[WARN] TestSprite tests require running backend, skipping auto-run{RESET}")
        print(f"   To run: python testsprite_tests/run_all_tests.py")
        results["TestSprite"] = None
    
    # Summary
    print(f"\n{BOLD}{'='*60}{RESET}")
    print(f"{BOLD}Test Summary{RESET}")
    print(f"{'='*60}")
    
    passed = 0
    failed = 0
    skipped = 0
    
    for name, result in results.items():
        if result is True:
            print(f"  {GREEN}[PASS] {name}{RESET}")
            passed += 1
        elif result is False:
            print(f"  {RED}[FAIL] {name}{RESET}")
            failed += 1
        else:
            print(f"  {YELLOW}[SKIP] {name}{RESET}")
            skipped += 1
    
    print(f"\n{BOLD}Total: {passed} passed, {failed} failed, {skipped} skipped{RESET}")
    
    if failed > 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
