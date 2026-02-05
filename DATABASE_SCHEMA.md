# Database Architecture

DukaPOS uses SQLite (managed via SQLModel/SQLAlchemy) for its data layer. The schema is optimized for offline reliability, performance, and clear audit trails for cashier shifts and transactions.

## Entity Relationship Diagram

```mermaid
erDiagram
    USER ||--o{ SHIFT : opens
    USER ||--o{ TRANSACTION : processes
    USER ||--o{ TRANSACTION-ITEM : records
    USER ||--o{ HELD-ORDER : saves
    
    SHIFT ||--o{ TRANSACTION : contains
    
    CUSTOMER ||--o{ TRANSACTION : "makes (credit)"
    
    PRODUCT ||--o{ TRANSACTION-ITEM : "included in"
    
    TRANSACTION ||--|{ TRANSACTION-ITEM : "consists of"

    USER {
        int id PK
        string username
        string role "admin | cashier"
        string password_hash
        string pin_hash
        bool is_active
    }

    PRODUCT {
        int id PK
        string name
        string barcode UK
        float price_buying
        float price_selling
        float tax_percentage
        int stock_quantity
        int min_stock_alert
    }

    CUSTOMER {
        int id PK
        string name
        string phone
        string kra_pin
        float current_balance
        float debt_limit
    }

    TRANSACTION {
        int id PK
        timestamp timestamp
        int shift_id FK
        int cashier_id FK
        int customer_id FK
        string payment_method "CASH | MPESA | CREDIT"
        float total_amount
        string invoice_number
        bool is_return
    }

    TRANSACTION-ITEM {
        int id PK
        int transaction_id FK
        int product_id FK
        int cashier_id FK
        int quantity
        float price_at_moment
        bool is_return
    }

    SHIFT {
        int id PK
        timestamp opened_at
        timestamp closed_at
        int cashier_id FK
        float opening_float
        float closing_actual
        float closing_expected
    }

    HELD-ORDER {
        int id PK
        int cashier_id FK
        string items_json
        float total_gross
        timestamp created_at
    }

    STORE-SETTINGS {
        int id PK
        string shop_name
        string kra_pin
        string mpesa_till_number
        bool auto_print_receipt
        bool sound_enabled
    }
```

## Core Management Strategies

1.  **Concurrency**: SQLite is configured with `check_same_thread=False` and a thread-safe session factory to handle concurrent Electron/Backend requests.
2.  **Versioning**: Database migrations are handled automatically on system startup to ensure the schema matches the latest application version.
3.  **Integrity**: Foreign key constraints are enforced to ensure that transactions and shifts always refer to valid users and products.
