import puppeteer from 'puppeteer';
import { CardDataWithScryfall } from '../types/database';

interface PDFData {
  requestId: number;
  userNick: string;
  username: string;
  requestNote: string;
  cardData: CardDataWithScryfall[];
  originalComment: string;
}

function generateHTML(data: PDFData): string {
  let cardsHtml = '';

  data.cardData.forEach((card) => {
    const specificPrint = card.specific_print || '';
    const lastSet = card.set || 'no match';
    const isOver5Dollars = card.is_over_5_dollars || '';
    const legalitiesStandard = card.legalities_standard || '';
    const cmc = card.cmc || '';
    const colors = card.colors || '';
    const type = card.primary_type || '';

    // Text glyphs + CSS color (native checkboxes print grayscale in Chromium PDF)
    const over5Mark =
      isOver5Dollars === '✅'
        ? '<span class="pdf-check pdf-check--yes">✓</span>'
        : '<span class="pdf-check pdf-check--no">—</span>';

    const standardLegalMark =
      legalitiesStandard === '✅'
        ? '<span class="pdf-check pdf-check--yes">✓</span>'
        : '<span class="pdf-check pdf-check--no">—</span>';

    cardsHtml += `
        <tr>
            <td>${card.qty}</td>
            <td>${card.name}</td>
            <td>${card.foil}</td>
            <td>${specificPrint}</td>
            <td style="text-align: center;">${over5Mark}</td>
            <td style="text-align: center;">${standardLegalMark}</td>
            <td>${type}</td>
            <td>${cmc}</td>
            <td>${colors}</td>
            <td>${lastSet}</td>
        </tr>`;
  });

  const today = new Date();
  const formattedDate = today.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `
<!DOCTYPE html>
<html>
<head>
    <title>Customer Order</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            color: #333;
            font-size: 10px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .header { margin-bottom: 10px; }
        .header p { margin: 5px 0; }
        h1 { color: #2c3e50; font-size: 16px; }
        h2 { font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10px; }
        th, td { border: 1px solid #ddd; padding: 5px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; }
        td { font-weight: bold; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .pdf-check {
            display: inline-block;
            min-width: 1.1em;
            text-align: center;
            font-size: 13px;
            line-height: 1;
            vertical-align: middle;
        }
        .pdf-check--yes { color: #16a34a; font-weight: bold; }
        .pdf-check--no { color: #9ca3af; }
        .aux-info { margin-top: 20px; border-top: 2px solid #2c3e50; padding-top: 10px; }
        .aux-info p { font-style: italic; color: #555; }
    </style>
</head>
<body>
    <div class="header">
        <h1>MTG Card Request #${data.requestId}</h1>
        <p><strong>User:</strong> ${data.userNick}</p>
        <p><strong>Username:</strong> ${data.username}</p>
        <p><strong>Date:</strong> ${formattedDate}</p>
        <p><strong>Note:</strong> ${data.requestNote}</p>
    </div>

    <h2>Card Checklist</h2>
    <table>
        <thead>
            <tr>
                <th>Qty</th>
                <th>Name</th>
                <th>Foil</th>
                <th>Specific Print</th>
                <th>Over $5?</th>
                <th>Standard Legal?</th>
                <th>Type</th>
                <th>CMC</th>
                <th>Colors</th>
                <th>Last Printed Set</th>
            </tr>
        </thead>
        <tbody>
            ${cardsHtml}
        </tbody>
    </table>

    <div class="aux-info">
        <h2>Original Comment</h2>
        <p>${data.originalComment}</p>
    </div>
</body>
</html>
`;
}

export async function generatePDF(data: PDFData): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });

  try {
    const page = await browser.newPage();
    const html = generateHTML(data);

    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px',
      },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

export function generatePDFFilename(
  requestId: number,
  customerName: string
): string {
  const date = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return `Request ${requestId} - ${customerName} - ${date}.pdf`;
}

