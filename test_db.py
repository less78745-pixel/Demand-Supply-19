import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv("frontend/api/.env")

url = os.getenv("DATABASE_URL")
print(f"Connecting to: {url.replace('%5Bj%40A_4f%252%2BSc8H%23%26%5D', 'HIDDEN')}")

try:
    engine = create_engine(url)
    with engine.connect() as conn:
        result = conn.execute(text("SELECT count(*) FROM processed_results;"))
        count = result.scalar()
        print(f"Connection successful! Rows in processed_results: {count}")
        
        result2 = conn.execute(text("SELECT id, module, created_at FROM processed_results ORDER BY created_at DESC LIMIT 5;"))
        rows = result2.fetchall()
        print(f"Latest rows: {rows}")
except Exception as e:
    print(f"Connection failed: {e}")
