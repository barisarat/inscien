import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from core.db import engine


def table_exists(conn, table_name):
    result = conn.execute(text(
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema = DATABASE() "
        "AND table_name = :table_name"
    ), {
        "table_name": table_name,
    })

    return result.scalar() > 0


def migrate():
    with engine.begin() as conn:
        if table_exists(conn, "gumroad_sale"):
            print("gumroad_sale already exists")
            return

        conn.execute(text(
            """
            CREATE TABLE gumroad_sale (
                id INT AUTO_INCREMENT PRIMARY KEY,

                sale_id VARCHAR(128) NOT NULL UNIQUE,
                product_id VARCHAR(128) NULL,
                subscription_id VARCHAR(128) NULL,
                order_id VARCHAR(128) NULL,
                purchaser_id VARCHAR(128) NULL,

                email VARCHAR(254) NULL,
                purchase_email VARCHAR(254) NULL,
                user_id INT NULL,

                product_name VARCHAR(255) NULL,
                product_permalink VARCHAR(255) NULL,

                price INT NULL,
                gumroad_fee INT NULL,
                currency_symbol VARCHAR(16) NULL,
                formatted_display_price VARCHAR(128) NULL,
                formatted_total_price VARCHAR(128) NULL,

                paid BOOLEAN NOT NULL DEFAULT 0,
                cancelled BOOLEAN NOT NULL DEFAULT 0,
                ended BOOLEAN NOT NULL DEFAULT 0,
                refunded BOOLEAN NOT NULL DEFAULT 0,
                partially_refunded BOOLEAN NOT NULL DEFAULT 0,
                chargedback BOOLEAN NOT NULL DEFAULT 0,
                disputed BOOLEAN NOT NULL DEFAULT 0,
                dispute_won BOOLEAN NOT NULL DEFAULT 0,

                is_recurring_billing BOOLEAN NOT NULL DEFAULT 0,
                subscription_duration VARCHAR(64) NULL,
                recurring_charge BOOLEAN NOT NULL DEFAULT 0,

                license_key VARCHAR(128) NULL,
                license_id VARCHAR(128) NULL,
                license_disabled BOOLEAN NOT NULL DEFAULT 0,
                license_uses INT NULL,

                quantity INT NULL,
                variants_and_quantity VARCHAR(255) NULL,
                referrer TEXT NULL,

                gumroad_created_at DATETIME NULL,
                gumroad_daystamp VARCHAR(128) NULL,

                raw_payload LONGTEXT NULL,

                api_synced_at DATETIME NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                INDEX ix_gumroad_sale_sale_id (sale_id),
                INDEX ix_gumroad_sale_product_id (product_id),
                INDEX ix_gumroad_sale_subscription_id (subscription_id),
                INDEX ix_gumroad_sale_order_id (order_id),
                INDEX ix_gumroad_sale_purchaser_id (purchaser_id),
                INDEX ix_gumroad_sale_email (email),
                INDEX ix_gumroad_sale_purchase_email (purchase_email),
                INDEX ix_gumroad_sale_user_id (user_id),
                INDEX ix_gumroad_sale_product_permalink (product_permalink)
            )
            """
        ))

    print("gumroad_sale table created")


if __name__ == "__main__":
    migrate()