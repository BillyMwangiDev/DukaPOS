"""Run all or a subset of TestSprite TC*.py tests. Targeted reruns for speed.

Usage:
  python run_all_tests.py                    # run all tests
  python run_all_tests.py TC001 TC005        # run only TC001 and TC005
  python run_all_tests.py TC002              # run only TC002
"""
import os
import sys
import subprocess

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

ALL_TESTS = [
    "TC001_get_health_endpoint_should_return_status_ok.py",
    "TC002_products_crud_operations_should_work_correctly.py",
    "TC003_get_product_by_barcode_should_return_correct_product.py",
    "TC004_create_transaction_should_record_sale_and_deduct_stock.py",
    "TC005_shifts_management_should_handle_open_current_zreport_and_close.py",
    "TC006_customers_crud_and_payment_recording_should_work.py",
    "TC007_held_orders_should_be_held_listed_retrieved_and_deleted.py",
    "TC008_inventory_upload_should_accept_excel_and_csv_files.py",
    "TC009_print_receipt_and_kick_drawer_should_trigger_printing_actions.py",
    "TC010_store_settings_should_be_retrieved_and_updated.py",
]

# Map TC001 -> TC001_*.py, etc.
ID_TO_FILE = {f[:5]: f for f in ALL_TESTS}

def resolve_tests(ids_from_cli):
    """Return list of test file names. If ids_from_cli is empty, return all."""
    if not ids_from_cli:
        return ALL_TESTS
    tests = []
    for tid in ids_from_cli:
        tid = tid.upper()
        if tid in ID_TO_FILE:
            tests.append(ID_TO_FILE[tid])
        else:
            print(f"Unknown test ID: {tid}", file=sys.stderr)
            sys.exit(1)
    return tests

requested = [a for a in sys.argv[1:] if a.upper().startswith("TC")]
tests = resolve_tests(requested)

results = []
for name in tests:
    r = subprocess.run(
        [sys.executable, name],
        cwd=SCRIPT_DIR,
        capture_output=True,
        text=True,
        timeout=60,
    )
    results.append((name, r.returncode == 0, r.stdout, r.stderr))

passed = sum(1 for _, ok, _, _ in results if ok)
print("=" * 60)
print("TestSprite test results")
print("=" * 60)
for name, ok, out, err in results:
    status = "PASS" if ok else "FAIL"
    print(f"  {status}: {name}")
    if not ok and (out or err):
        if err:
            print(f"    stderr:\n{err[:800]}")
        if out:
            print(f"    stdout: {out[:500]}")
print("=" * 60)
print(f"Total: {passed}/{len(results)} passed")
print("=" * 60)
sys.exit(0 if passed == len(results) else 1)
