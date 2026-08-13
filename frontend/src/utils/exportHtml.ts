/**
 * Clone a DOM element by id and strip anything marked `.no-export`
 * (buttons, dead filter controls that won't work once cloned, etc.)
 */
export function cloneCleanedElement(elementId: string): HTMLElement {
  const elem = document.getElementById(elementId);
  if (!elem) {
    throw new Error(`Element dengan ID ${elementId} tidak ditemukan.`);
  }

  // Clone element agar tidak mengubah DOM asli jika ada modifikasi
  const clonedElem = elem.cloneNode(true) as HTMLElement;

  // Hapus semua tombol atau elemen interaktif yang tidak perlu diekspor (opsional, jika kita beri class khusus 'no-export')
  const noExportNodes = clonedElem.querySelectorAll('.no-export');
  noExportNodes.forEach(node => node.parentNode?.removeChild(node));

  return clonedElem;
}

/**
 * Collect every CSS rule from the page's stylesheets as one inlinable string,
 * so the exported file renders correctly with no network access.
 */
export function collectInlineCss(): string {
  let cssRules = '';
  for (let i = 0; i < document.styleSheets.length; i++) {
    const sheet = document.styleSheets[i];
    try {
      if (sheet.cssRules) {
        for (let j = 0; j < sheet.cssRules.length; j++) {
          cssRules += sheet.cssRules[j].cssText + '\n';
        }
      }
    } catch (e) {
      // Abaikan error CORS (cross-origin stylesheets)
      console.warn("Could not read CSS rules from stylesheet", sheet.href);
    }
  }
  return cssRules;
}

export function getHtmlExportString(elementId: string): string {
  const clonedElem = cloneCleanedElement(elementId);
  const cssRules = collectInlineCss();

  // Gunakan body class agar tema gelap/terang (misal class 'dark') ikut terbawa
  const bodyClass = document.body.className;

  // Rangkai menjadi satu dokumen HTML utuh
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Exported Report</title>
  <style>
    /* Injected CSS Styles from current page */
    ${cssRules}
    
    /* Tambahan CSS khusus print/export */
    body {
      margin: 0;
      padding: 20px;
      min-height: 100vh;
    }
    .html-export-search-container {
      margin: 20px auto;
      max-width: 1400px;
      background: #f8fafc;
      padding: 16px;
      border-radius: 12px;
      border: 1px solid #cbd5e1;
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    }
    .html-export-search-container.dark {
      background: #1e293b;
      border-color: #334155;
      color: #f8fafc;
    }
    .html-export-search-input {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid #94a3b8;
      border-radius: 8px;
      font-size: 16px;
      outline: none;
    }
    .html-export-search-input:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px rgba(59,130,246,0.2);
    }
  </style>
</head>
<body class="${bodyClass}">
  <div class="html-export-search-container ${bodyClass.includes('dark') ? 'dark' : ''}">
    <h3 style="margin:0; font-family: sans-serif;">Pencarian Data Interaktif (Mode Offline)</h3>
    <p style="margin:0; font-size: 14px; opacity: 0.8; font-family: sans-serif;">File ini adalah hasil export statis. Ketik di bawah ini untuk memfilter data pada semua tabel.</p>
    <input type="text" id="offlineSearch" class="html-export-search-input" placeholder="Ketik kata kunci untuk mencari (contoh: DC Jakarta, nama SKU)...">
  </div>

  <div style="max-width: 1400px; margin: 0 auto;">
    ${clonedElem.outerHTML}
  </div>

  <script>
    // Skrip Vanilla JS untuk memfilter tabel
    document.addEventListener("DOMContentLoaded", function() {
      const searchInput = document.getElementById('offlineSearch');
      
      // Ambil semua TR yang ada di dalam tbody
      const allRows = document.querySelectorAll('table tbody tr');
      
      searchInput.addEventListener('keyup', function(e) {
        const query = e.target.value.toLowerCase();
        
        allRows.forEach(row => {
          // Abaikan baris header atau footer jika ada
          const text = row.innerText || row.textContent;
          if (text.toLowerCase().indexOf(query) > -1) {
            row.style.display = '';
          } else {
            row.style.display = 'none';
          }
        });
      });
    });
  </script>
</body>
</html>
  `.trim();

  return htmlContent;
}

export function downloadHtml(htmlContent: string, filename: string) {
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
