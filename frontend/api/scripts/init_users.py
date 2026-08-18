"""
init_users.py
Inisialisasi akun pengguna dashboard WMS + Row-Level Security (RLS).

Cara pakai:
    pip install pandas bcrypt
    python init_users.py

Tidak butuh file eksternal - data CSV ditempel langsung di bawah dan
dibaca lewat io.StringIO, lalu digabung dengan akun Super Admin (AFIF)
yang disisipkan secara terprogram (hardcoded).
"""

import csv
import io
from typing import Dict, List, Optional

import bcrypt
import pandas as pd


# ---------------------------------------------------------------------------
# 1. DATA MENTAH (CSV) - tempel langsung, tidak perlu file eksternal
# ---------------------------------------------------------------------------
RAW_CSV = """User name,Password,Hak Akses
Aceh,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Ambon,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Bali,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Bandung,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Banjarmasin,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Banyumas,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Bengkulu,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Cirebon,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
DC Regional 1,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
DC Regional 2,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
DC Regional 3,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Jakarta,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Jambi,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Jember,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Kendari,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Kupang,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Lampung,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Makassar,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Manado,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Mataram,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Medan,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Padang,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Palembang,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Palu,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Pekanbaru,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Pontianak,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Samarinda,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Semarang,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Surabaya,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Tasikmalaya,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
Yogyakarta,7889#,"Hanya bisa view di modul SOH-TO-Vessel,History Sales-Outstanding,PR Update & Tracking Container,SKU Velocity,Occupancy & Inventory, tidak bisa lihat tombol upload, data demo dan download , dan data yang ditampilkan harus difiler sesuai nama user name , jadi hanya bisa melihat data kotanya sendiri"
"""


# ---------------------------------------------------------------------------
# 2. KONSTANTA HAK AKSES
# ---------------------------------------------------------------------------
STANDARD_MODULES = [
    "SOH-TO-Vessel",
    "History Sales-Outstanding",
    "PR Update & Tracking Container",
    "SKU Velocity",
    "Occupancy & Inventory",
]

ALL_MODULES = STANDARD_MODULES + [
    "User Management",
    "Upload Data",
    "Demo Data",
    "Download / Export",
]

SUPER_ADMIN_USERNAME = "AFIF"
SUPER_ADMIN_PASSWORD = "out19"  # plaintext hanya di source; langsung di-hash saat runtime, tidak pernah disimpan apa adanya


# ---------------------------------------------------------------------------
# 3. PASSWORD HASHING (bcrypt - salted, one-way)
# ---------------------------------------------------------------------------
def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


# ---------------------------------------------------------------------------
# 4. PARSING CSV (io.StringIO) -> DAFTAR USER STANDAR
# ---------------------------------------------------------------------------
def parse_standard_users(raw_csv: str) -> List[Dict]:
    reader = csv.DictReader(io.StringIO(raw_csv.strip()))
    users = []
    for row in reader:
        username = row["User name"].strip()
        users.append({
            "username": username,
            "password_hash": hash_password(row["Password"].strip()),
            "role": "STANDARD",
            "is_super_admin": False,
            "allowed_modules": STANDARD_MODULES,
            "can_upload": False,
            "can_view_demo_data": False,
            "can_download": False,
            # RLS: user hanya boleh melihat baris data milik kotanya sendiri
            "city_filter": username,
            "raw_permission_note": row["Hak Akses"].strip(),
        })
    return users


# ---------------------------------------------------------------------------
# 5. SUPER ADMIN - disisipkan terprogram, BUKAN dari CSV
# ---------------------------------------------------------------------------
def build_super_admin() -> Dict:
    return {
        "username": SUPER_ADMIN_USERNAME,
        "password_hash": hash_password(SUPER_ADMIN_PASSWORD),
        "role": "SUPER_ADMIN",
        "is_super_admin": True,
        "allowed_modules": ALL_MODULES,
        "can_upload": True,
        "can_view_demo_data": True,
        "can_download": True,
        "city_filter": None,  # None => tidak difilter kota/cabang apa pun
        "raw_permission_note": "Super Admin - akses penuh ke seluruh modul, tanpa batasan kota",
    }


def build_user_database() -> Dict[str, Dict]:
    """Gabungkan user standar (dari CSV) + akun Super Admin hardcoded."""
    db: Dict[str, Dict] = {}
    for user in parse_standard_users(RAW_CSV):
        db[user["username"]] = user

    admin = build_super_admin()
    db[admin["username"]] = admin
    return db


# ---------------------------------------------------------------------------
# 6. ROW-LEVEL SECURITY (RLS) + MODULE ACCESS CONTROL
# ---------------------------------------------------------------------------
class DashboardAccessControl:
    """
    Dua lapis kontrol akses untuk dashboard:
      1. Module-level access -> modul apa saja + tombol upload/download/demo yang boleh dilihat.
      2. Row-level security   -> baris data dibatasi sesuai kota milik user,
                                 KECUALI user dengan is_super_admin=True (mis. AFIF).
    """

    def __init__(self, user_database: Dict[str, Dict]):
        self._db = user_database

    def authenticate(self, username: str, password: str) -> Optional[Dict]:
        user = self._db.get(username)
        if user and verify_password(password, user["password_hash"]):
            return user
        return None

    def can_access_module(self, username: str, module_name: str) -> bool:
        user = self._db.get(username)
        if not user:
            return False
        return user["is_super_admin"] or module_name in user["allowed_modules"]

    def filter_dataframe(self, username: str, df: pd.DataFrame, city_column: str = "City") -> pd.DataFrame:
        """
        Inti logika RLS:
          - AFIF / super admin lain -> dikembalikan apa adanya (seluruh dataset).
          - User biasa              -> hanya baris dengan city_column == username mereka.
        """
        user = self._db.get(username)
        if user is None:
            return df.iloc[0:0]  # user tidak dikenal -> dataset kosong

        if user["is_super_admin"]:
            return df

        if city_column not in df.columns:
            raise ValueError(f"Kolom '{city_column}' tidak ditemukan pada dataframe")

        return df[df[city_column].str.strip().str.lower() == user["city_filter"].strip().lower()]


# ---------------------------------------------------------------------------
# 7. DEMO / SELF-TEST
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    user_db = build_user_database()
    acl = DashboardAccessControl(user_db)

    print(f"Total akun ter-load : {len(user_db)}")
    print(f"Super admin         : {SUPER_ADMIN_USERNAME}\n")

    # Contoh dataset SOH (ganti dengan data asli dari DB/upload di produksi)
    sample_soh = pd.DataFrame({
        "City": ["Aceh", "Bali", "Bali", "Jakarta", "Surabaya"],
        "SKU": ["SKU-001", "SKU-002", "SKU-003", "SKU-004", "SKU-005"],
        "SOH_Qty": [120, 45, 300, 980, 210],
    })

    # Kasus 1: user biasa "Bali" hanya melihat baris kotanya sendiri
    if acl.authenticate("Bali", "7889#"):
        print("Data yang terlihat oleh 'Bali':")
        print(acl.filter_dataframe("Bali", sample_soh), "\n")

    # Kasus 2: AFIF (super admin) melihat seluruh dataset tanpa filter kota
    if acl.authenticate("AFIF", "out19"):
        print("Data yang terlihat oleh 'AFIF' (Super Admin):")
        print(acl.filter_dataframe("AFIF", sample_soh), "\n")

    # Kasus 3: pengecekan akses modul & tombol
    print("Bali bisa akses modul 'Upload Data'?  ->", acl.can_access_module("Bali", "Upload Data"))
    print("AFIF bisa akses modul 'Upload Data'?  ->", acl.can_access_module("AFIF", "Upload Data"))
    print("Bali bisa akses modul 'SKU Velocity'? ->", acl.can_access_module("Bali", "SKU Velocity"))
