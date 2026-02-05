import os
import sqlite3
import sys

def wipe_database():
    """
    Safely clears business data (products, sales, customers) 
    while preserving users and settings.
    """
    # 1. Determine database path
    # Check for common locations
    possible_paths = [
        "dukapos.db",
        "backend/dukapos.db",
    ]
    
    # Also check Electron production path (Windows)
    appdata = os.environ.get("APPDATA")
    if appdata:
        prod_path = os.path.join(appdata, "DukaPOS", "data", "pos.db")
        possible_paths.append(prod_path)

    db_path = None
    for p in possible_paths:
        if os.path.exists(p):
            db_path = p
            break
            
    if not db_path:
        print("Error: Could not find database file.")
        print("Please ensure you are running this from the project root.")
        return

    print(f"Found database at: {db_path}")
    confirm = input("WARNING: This will delete ALL products, sales, and customers. Continue? (y/N): ")
    if confirm.lower() != 'y':
        print("Operation cancelled.")
        return

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Disable foreign keys temporarily to allow wiping
        cursor.execute("PRAGMA foreign_keys = OFF;")
        
        # Tables to wipe
        tables_to_clear = [
            "transactionitem",
            "transaction",
            "product",
            "customer",
            "shift",
            "heldorder",
        ]
        
        for table in tables_to_clear:
            print(f"Wiping table: {table}...")
            cursor.execute(f"DELETE FROM {table};")
            
        # Reset invoice sequence
        print("Resetting invoice sequence...")
        cursor.execute("UPDATE invoicesequence SET last_number = 0;")
        
        # Re-enable foreign keys
        cursor.execute("PRAGMA foreign_keys = ON;")
        
        conn.commit()
        conn.close()
        print("\nSUCCESS: All business data cleared.")
        print("You can now start fresh with a clean product catalog.")
        
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    wipe_database()
