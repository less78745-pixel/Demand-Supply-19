"""
Script to setup RLS (Row Level Security) policies on Supabase.
This allows the frontend (Supabase JS client) to read data from processed_results.
"""
from sqlalchemy import create_engine, text

url = "postgresql://postgres.zynoznmdxcttkokyildh:j%40A_4f%252%2BSc8H%23%26@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres"

engine = create_engine(url)

rls_sqls = [
    # Enable RLS on processed_results
    "ALTER TABLE processed_results ENABLE ROW LEVEL SECURITY;",
    # Allow public SELECT access (so frontend JS client can read)
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'processed_results' 
            AND policyname = 'Allow public read access'
        ) THEN
            CREATE POLICY "Allow public read access"
            ON processed_results FOR SELECT
            USING (true);
        END IF;
    END $$;
    """,
    # Allow public INSERT access (so frontend JS client can save)
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'processed_results' 
            AND policyname = 'Allow public insert access'
        ) THEN
            CREATE POLICY "Allow public insert access"
            ON processed_results FOR INSERT
            WITH CHECK (true);
        END IF;
    END $$;
    """,
    # Enable RLS on uploads
    "ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;",
    # Allow public SELECT on uploads too
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'uploads' 
            AND policyname = 'Allow public read uploads'
        ) THEN
            CREATE POLICY "Allow public read uploads"
            ON uploads FOR SELECT
            USING (true);
        END IF;
    END $$;
    """,
    # Enable Realtime on processed_results
    "ALTER PUBLICATION supabase_realtime ADD TABLE processed_results;",
]

print("Setting up RLS policies on Supabase...")
with engine.connect() as conn:
    for sql in rls_sqls:
        try:
            conn.execute(text(sql))
            conn.commit()
            print(f"OK: {sql.strip()[:60]}...")
        except Exception as e:
            print(f"SKIP (may already exist): {e}")

print("\nDone! RLS and Realtime are configured.")
