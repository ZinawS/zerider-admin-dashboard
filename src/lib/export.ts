export interface ExportColumn<T> {
  header: string;
  getValue: (row: T) => string | number | null | undefined;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportToCsv<T>(filename: string, rows: T[], columns: ExportColumn<T>[]) {
  const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = columns.map((c) => escape(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => escape(c.getValue(r))).join(',')).join('\n');
  // BOM for Excel UTF-8 detection
  const blob = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

// Excel SpreadsheetML format — opens natively in Excel without a library
export function exportToExcel<T>(filename: string, rows: T[], columns: ExportColumn<T>[], sheetName = 'Report') {
  const esc = (v: any) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const headerRow = columns
    .map((c) => `<Cell><Data ss:Type="String">${esc(c.header)}</Data></Cell>`)
    .join('');

  const dataRows = rows
    .map((r) => {
      const cells = columns.map((c) => {
        const val = c.getValue(r);
        const type = typeof val === 'number' ? 'Number' : 'String';
        return `<Cell><Data ss:Type="${type}">${esc(String(val ?? ''))}</Data></Cell>`;
      }).join('');
      return `<Row>${cells}</Row>`;
    })
    .join('');

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="${esc(sheetName)}">
    <Table>
      <Row>${headerRow.replace(/<Cell>/g, '<Cell ss:StyleID="Header">')}</Row>
      ${dataRows}
    </Table>
  </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.xls') ? filename : `${filename}.xls`);
}

// Print-to-PDF: opens a styled report window and triggers the browser print dialog
export function printReport<T>(title: string, rows: T[], columns: ExportColumn<T>[], subtitle?: string) {
  const esc = (v: any) => {
    const s = String(v ?? '');
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  const headerHtml = columns.map((c) => `<th>${esc(c.header)}</th>`).join('');
  const bodyHtml = rows.map((r) =>
    `<tr>${columns.map((c) => `<td>${esc(c.getValue(r))}</td>`).join('')}</tr>`
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Arial, sans-serif; font-size: 11px; color: #111; padding: 24px; }
  .header { margin-bottom: 16px; }
  h1 { font-size: 18px; font-weight: 700; }
  p.meta { color: #6b7280; font-size: 10px; margin-top: 4px; }
  .print-btn { margin-bottom: 16px; padding: 6px 14px; background: #1d4ed8; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-family: inherit; }
  table { border-collapse: collapse; width: 100%; }
  thead th { background: #f3f4f6; text-align: left; padding: 6px 8px; border: 1px solid #e5e7eb; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
  tbody td { padding: 5px 8px; border: 1px solid #e5e7eb; }
  tbody tr:nth-child(even) td { background: #f9fafb; }
  @media print { .print-btn { display: none; } body { padding: 8px; } }
</style>
</head>
<body>
<div class="header">
  <h1>${esc(title)}</h1>
  ${subtitle ? `<p class="meta">${esc(subtitle)}</p>` : ''}
  <p class="meta">Generated: ${new Date().toLocaleString()}</p>
</div>
<button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
<table>
  <thead><tr>${headerHtml}</tr></thead>
  <tbody>${bodyHtml}</tbody>
</table>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=1000,height=700');
  if (!win) { alert('Please allow pop-ups to generate the PDF.'); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 600);
}
