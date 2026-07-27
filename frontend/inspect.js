const fs = require('fs');
const xlsx = require('xlsx');

async function main() {
  const url = "https://docs.google.com/spreadsheets/d/1frbKmEAnJ8ibwsheMHo2p7PRwY-U-3JtiDZLmMAjxNY/export?format=xlsx";
  console.log("Downloading spreadsheet...");
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  
  console.log("Parsing...");
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  console.log(`Sheet names: ${workbook.SheetNames.join(', ')}\n`);
  
  for (const sheetName of workbook.SheetNames) {
    console.log(`--- Sheet: ${sheetName} ---`);
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    
    for (let i = 0; i < Math.min(3, data.length); i++) {
      console.log(`Row ${i}: ${JSON.stringify(data[i].slice(0, 50))}`);
    }
    console.log("\n");
  }
}

main().catch(console.error);
