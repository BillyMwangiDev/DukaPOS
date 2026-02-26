# Database Architecture

DukaPOS uses SQLite (managed via SQLModel/SQLAlchemy) for its data layer. The schema is optimized for offline reliability, performance, and clear audit trails for cashier shifts and transactions.

## Entity Relationship Diagram

```mermaid
erDiagram
    STAFF ||--o{ SHIFT : opens
    STAFF ||--o{ RECEIPT : processes
    STAFF ||--o{ SALEITEM : records
    STAFF ||--o{ HELDORDER : saves
    
    SHIFT ||--o{ RECEIPT : contains
    
    CUSTOMER ||--o{ RECEIPT : "makes (credit)"
    
    PRODUCT ||--o{ SALEITEM : "included in"
    PRODUCT ||--o{ STOCKADJUSTMENT : "adjusted via"
    PRODUCT ||--o{ PURCHASEORDERITEM : "ordered in"
    PRODUCT ||--o{ PRICEOVERRIDELOG : "overridden in"

    RECEIPT ||--|{ SALEITEM : "consists of"

    SUPPLIER ||--o{ PURCHASEORDER : "receives"
    PURCHASEORDER ||--|{ PURCHASEORDERITEM : "contains"

    STAFF {
        int id PK
        string username UK
        string password_hash
        string pin_hash
        string role "admin | cashier | developer"
        bool is_active
    }

    PRODUCT {
        int id PK
        string name
        string description
        string category "default General"
        string barcode UK
        string image_url
        float price_buying
        float price_selling "VAT-inclusive retail"
        float wholesale_price "VAT-inclusive"
        int wholesale_threshold
        float tax_percentage "default 16.0"
        int stock_quantity
        int min_stock_alert
        string item_discount_type "percent | fixed"
        float item_discount_value
        datetime item_discount_start
        datetime item_discount_expiry
    }

    CUSTOMER {
        int id PK
        string name
        string phone
        string email
        string address
        string kra_pin
        float current_balance
        float debt_limit
        float points_balance "loyalty points"
        float lifetime_points "cumulative earned"
    }

    SHIFT {
        int id PK
        datetime opened_at
        datetime closed_at
        int cashier_id FK
        float opening_float
        float closing_actual
        float closing_expected
    }

    RECEIPT {
        int id PK
        string receipt_id UK "POS-01-XXXXX"
        datetime timestamp
        int shift_id FK
        int staff_id FK
        int customer_id FK
        float total_amount
        float discount_amount
        string payment_type "CASH | MOBILE | BANK | CREDIT | SPLIT"
        string payment_subtype "M-Pesa | Bank Transfer | etc."
        string reference_code
        string checkout_request_id
        string mpesa_code
        string payment_details_json
        bool is_return
        string origin_station
        string payment_status "COMPLETED | PENDING | FAILED"
        string business_name
        string bank_name
        string bank_sender_name
        bool bank_confirmed
        datetime bank_confirmation_timestamp
    }

    SALEITEM {
        int id PK
        int receipt_id FK
        int product_id FK
        int staff_id FK
        int quantity
        float price_at_moment
        bool is_return
        string return_reason
    }

    HELDORDER {
        int id PK
        int staff_id FK
        string items_json
        float total_gross
        string notes
        datetime created_at
    }

    INVOICESEQUENCE {
        int id PK
        int last_number
    }

    STORESETTINGS {
        int id PK
        string shop_name
        string station_id
        string kra_pin
        string mpesa_till_number
        string contact_phone
        string receipt_header
        string receipt_footer
        float vat_rate "default 16.0"
        bool auto_print_receipt
        bool low_stock_warning_enabled
        bool sound_enabled
        bool auto_backup_enabled
        int staff_limit
        string master_ip
    }

    DISCOUNT {
        int id PK
        string name
        string discount_type "percent | fixed"
        float value
        string scope "order | item"
        bool active
        datetime start_date
        datetime end_date
    }

    SUPPLIER {
        int id PK
        string name
        string contact_name
        string phone
        string email
        string address
        string notes
        datetime created_at
    }

    PURCHASEORDER {
        int id PK
        int supplier_id FK
        string status "draft | ordered | received | cancelled"
        datetime ordered_at
        datetime received_at
        string notes
    }

    PURCHASEORDERITEM {
        int id PK
        int po_id FK
        int product_id FK
        int quantity_ordered
        int quantity_received
        float unit_cost
    }

    STOCKADJUSTMENT {
        int id PK
        int product_id FK
        int quantity_change "positive = add, negative = remove"
        string reason "damage | theft | expired | correction | other"
        string adjusted_by
        datetime created_at
    }

    PRICEOVERRIDELOG {
        int id PK
        int product_id FK
        float original_price
        float override_price
        string overridden_by
        string receipt_id
        datetime created_at
    }
```

## Core Management Strategies

1.  **Concurrency**: SQLite is configured with **Write-Ahead Logging (WAL)** mode enabled. This allows simultaneous readers and a single writer, preventing most "database is locked" errors during background polling or high-frequency sales.
2.  **Versioning**: Database migrations are handled automatically on system startup to ensure the schema matches the latest application version.
3.  **Integrity**: Foreign key constraints are enforced to ensure that receipts and shifts always refer to valid staff and products.
