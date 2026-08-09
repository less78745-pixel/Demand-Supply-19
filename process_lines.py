import re

with open(r"c:\Users\DELL\Downloads\python\Vibes Coding\wms-monorepo\deleted_lines.txt", "r", encoding="utf-8") as f:
    text = f.read()

# Change data mapping
text = text.replace("deadVol += (r['AVG SALES MONTH'] || 0);", "deadVol += (r['Value'] || 0);")
text = text.replace("risingVol += (r['AVG SALES MONTH'] || 0);", "risingVol += (r['Value'] || 0);")
text = text.replace("healthyVol += (r['AVG SALES MONTH'] || 0);", "healthyVol += (r['Value'] || 0);")

# Change keys
text = text.replace("'Dead Stock Volume': deadVol", "'Dead Stock Value': deadVol")
text = text.replace("'Fast Moving Volume': risingVol", "'Fast Moving Value': risingVol")
text = text.replace("'Healthy Volume': healthyVol", "'Healthy Value': healthyVol")

# Change chart title
text = text.replace("Tren Volume Penjualan Berdasarkan Bulan (Agregat SKU)", "Tren Nilai Penjualan Berdasarkan Bulan (Agregat SKU)")
text = text.replace("Perbandingan total volume pergerakan antar klasifikasi matriks berdasar kelompok bulan.", "Perbandingan total nilai (Value) pergerakan antar klasifikasi matriks berdasar kelompok bulan.")

# Change tooltip formatter
text = text.replace("formatter={(val: any) => [formatNum(val), undefined]}", "formatter={(val: any) => [formatRp(val), undefined]}")

# Change line data keys
text = text.replace("dataKey=\"Dead Stock Volume\"", "dataKey=\"Dead Stock Value\"")
text = text.replace("dataKey=\"Fast Moving Volume\"", "dataKey=\"Fast Moving Value\"")
text = text.replace("dataKey=\"Healthy Volume\"", "dataKey=\"Healthy Value\"")

with open(r"c:\Users\DELL\Downloads\python\Vibes Coding\wms-monorepo\deleted_lines.txt", "w", encoding="utf-8") as out:
    out.write(text)

print("Modified deleted_lines.txt successfully.")
