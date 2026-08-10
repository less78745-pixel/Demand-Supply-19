import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv("frontend/api/.env")

url = "postgresql://postgres.zynoznmdxcttkokyildh:j%40A_4f%252%2BSc8H%23%26@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres"

print(f"Connecting to Supabase via pooler...")

try:
    engine = create_engine(url)
    with engine.connect() as conn:
        print("Connected!")
        
        # Check if table exists
        result = conn.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'processed_results'
            );
        """))
        table_exists = result.scalar()
        print(f"Table 'processed_results' exists: {table_exists}")
        
        if table_exists:
            result = conn.execute(text("SELECT count(*) FROM processed_results;"))
            count = result.scalar()
            print(f"Rows in processed_results: {count}")
            
            if count > 0:
                result2 = conn.execute(text("SELECT id, module, created_at FROM processed_results ORDER BY created_at DESC LIMIT 3;"))
                rows = result2.fetchall()
                print(f"Latest rows:")
                for row in rows:
                    print(f"  - {row}")
        else:
            print("Table needs to be created by the backend on first startup.")

except Exception as e:
    print(f"Error: {e}")
