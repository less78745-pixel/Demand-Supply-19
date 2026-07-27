import pandas as pd
import requests
import io

url = "https://docs.google.com/spreadsheets/d/1frbKmEAnJ8ibwsheMHo2p7PRwY-U-3JtiDZLmMAjxNY/export?format=xlsx"

print("Downloading spreadsheet...")
response = requests.get(url)
if response.status_code == 200:
    print("Download successful. Parsing...")
    try:
        xls = pd.ExcelFile(io.BytesIO(response.content))
        print(f"Sheet names: {xls.sheet_names}\n")
        
        for sheet_name in ['On Hand', 'history sales-outstanding', 'pr update', 'data compile']:
            if sheet_name in xls.sheet_names:
                print(f"--- Sheet: {sheet_name} ---")
                df = pd.read_excel(xls, sheet_name=sheet_name, header=None, nrows=10)
                
                # Print the first 5 rows to see where the 'X' is and where the headers are
                for i in range(min(5, len(df))):
                    row = df.iloc[i].tolist()
                    row = [str(x) if pd.notna(x) else "" for x in row]
                    # Only print non-empty parts of the row to save space
                    print(f"Row {i}: {row[:30]}")
                print("\n")
            else:
                print(f"--- Sheet: {sheet_name} NOT FOUND ---\n")
    except Exception as e:
        print(f"Error parsing excel: {e}")
else:
    print(f"Failed to download. HTTP {response.status_code}")
