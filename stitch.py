import sys

with open(r"c:\Users\DELL\Downloads\python\Vibes Coding\wms-monorepo\frontend\src\app\dashboard-harian\sku-velocity\page.tsx", "r", encoding="utf-8") as f:
    page = f.readlines()

with open(r"c:\Users\DELL\Downloads\python\Vibes Coding\wms-monorepo\deleted_lines.txt", "r", encoding="utf-8") as f:
    deleted = f.readlines()

# page has 841 lines.
# We want to replace lines from 395 up to 604 (0-indexed 394 to 604).
# Wait, let's find the exact indices.
start_idx = -1
end_idx = -1

for i, line in enumerate(page):
    if "let deadVol = 0;" in line and start_idx == -1:
        start_idx = i - 1 # before let risingVol = 0;
    if "<ExportHtmlButton elementId=\"export-container\"" in line:
        end_idx = i + 1
        break

if start_idx != -1 and end_idx != -1:
    new_page = page[:start_idx] + deleted + ["\n"] + page[end_idx:]
    with open(r"c:\Users\DELL\Downloads\python\Vibes Coding\wms-monorepo\frontend\src\app\dashboard-harian\sku-velocity\page.tsx", "w", encoding="utf-8") as f:
        f.writelines(new_page)
    print(f"Reconstructed page.tsx (replaced index {start_idx} to {end_idx})")
else:
    print(f"Indices not found! start_idx: {start_idx}, end_idx: {end_idx}")
