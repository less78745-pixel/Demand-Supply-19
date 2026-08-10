import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv("frontend/api/.env")
url = "postgresql://postgres.zynoznmdxcttkokyildh:j%40A_4f%252%2BSc8H%23%26@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres"

print("Checking Supabase...")
engine = create_engine(url)
try:
    with engine.connect() as conn:
        result = conn.execute(text("SELECT count(*) FROM processed_results;"))
        count = result.scalar()
        print(f"Total rows in processed_results: {count}")
        
        if count > 0:
            res = conn.execute(text("SELECT id, created_at, status FROM processed_results ORDER BY created_at DESC LIMIT 3;"))
            for r in res:
                print(f"Row: {r}")
except Exception as e:
    print(f"Error: {e}")
