const PDFDocument = require('pdfkit');
const fs   = require('fs');
const path = require('path');

const GOLD   = '#c9a84c';
const DARK   = '#1a1a2e';
const GREY   = '#666666';
const LIGHT  = '#f7f7f7';

// ─── Draw a labelled row ──────────────────────────────────────────────────────
const drawRow = (doc, label, value, y, shaded) => {
  if (shaded) doc.rect(50, y, 495, 22).fill(LIGHT);
  doc.fillColor(GREY).fontSize(10).text(label, 55, y + 6, { width: 180 });
  doc.fillColor(DARK).fontSize(10).text(String(value ?? '—'), 235, y + 6, { width: 305 });
};

// ─── Main generator ───────────────────────────────────────────────────────────
/**
 * @param {Object} data
 *   refId, guestName, guestEmail, guestPhone,
 *   packageName, fromDate, toDate, adults, children, infant,
 *   quoteText, expiresAt, quotedBy
 * @param {string} filename  e.g. "quote_abc123_1234567890.pdf"
 * @returns {Promise<string>}  file path stored under /uploads/
 */
const generateQuotePDF = (data, filename) => {
  return new Promise((resolve, reject) => {
    try {
      const outPath = path.join(__dirname, '../uploads', filename);
      const doc     = new PDFDocument({ margin: 50, size: 'A4' });
      const stream  = fs.createWriteStream(outPath);

      doc.pipe(stream);

      // ── Header bar ──────────────────────────────────────────────────────────
      doc.rect(0, 0, 595, 80).fill(DARK);
      doc.fillColor(GOLD).fontSize(26).text('Vista Voyage', 50, 22, { align: 'left' });
      doc.fillColor('#cccccc').fontSize(10).text('Luxury Travel Experiences', 50, 52);

      // ── Title ───────────────────────────────────────────────────────────────
      doc.moveDown(3);
      doc.fillColor(GOLD).fontSize(18).text('OFFICIAL QUOTATION', 50, 100);
      doc.moveTo(50, 122).lineTo(545, 122).strokeColor(GOLD).lineWidth(1.5).stroke();

      // ── Meta ─────────────────────────────────────────────────────────────────
      doc.fillColor(GREY).fontSize(10)
        .text(`Date Issued: ${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' })}`, 50, 132)
        .text(`Reference:   ${data.refId}`, 50, 148);
      if (data.quotedBy) {
        doc.text(`Prepared by: ${data.quotedBy}`, 50, 164);
      }

      // ── Client ──────────────────────────────────────────────────────────────
      let y = data.quotedBy ? 196 : 180;
      doc.fillColor(DARK).fontSize(12).text('CLIENT INFORMATION', 50, y, { underline: false });
      doc.moveTo(50, y + 16).lineTo(545, y + 16).strokeColor('#e0e0e0').lineWidth(1).stroke();

      const clientRows = [
        ['Name',           data.guestName],
        ['Email',          data.guestEmail],
        ['Phone / WhatsApp', data.guestPhone],
      ];
      y += 22;
      clientRows.forEach(([label, value], i) => {
        drawRow(doc, label, value, y, i % 2 === 0);
        y += 22;
      });

      // ── Trip ────────────────────────────────────────────────────────────────
      y += 12;
      doc.fillColor(DARK).fontSize(12).text('TRIP DETAILS', 50, y);
      doc.moveTo(50, y + 16).lineTo(545, y + 16).strokeColor('#e0e0e0').lineWidth(1).stroke();

      const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';

      const tripRows = [
        ['Package',      data.packageName],
        ['Travel From',  fmt(data.fromDate)],
        ['Travel To',    fmt(data.toDate)],
        ['Adults',       data.adults ?? 1],
        ['Children',     data.children ?? 0],
        ['Infants',      data.infant ?? 0],
      ];
      y += 22;
      tripRows.forEach(([label, value], i) => {
        drawRow(doc, label, value, y, i % 2 === 0);
        y += 22;
      });

      // ── Quote ────────────────────────────────────────────────────────────────
      y += 16;
      doc.fillColor(DARK).fontSize(12).text('QUOTE DETAILS', 50, y);
      doc.moveTo(50, y + 16).lineTo(545, y + 16).strokeColor('#e0e0e0').lineWidth(1).stroke();
      y += 24;

      doc.fillColor('#333333').fontSize(11)
        .text(data.quoteText || 'Quote details to be provided.', 50, y, { width: 495, lineGap: 4 });

      if (data.expiresAt) {
        y = doc.y + 14;
        doc.rect(50, y, 495, 26).fill('#fff3d4');
        doc.fillColor('#7a5c00').fontSize(10)
          .text(`⏳  This quote is valid until: ${fmt(data.expiresAt)}`, 58, y + 8);
      }

      // ── Footer ───────────────────────────────────────────────────────────────
      doc.moveDown(3);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e0e0e0').lineWidth(1).stroke();
      doc.moveDown(0.5);
      doc.fillColor(GREY).fontSize(9)
        .text(
          'Thank you for choosing Vista Voyage. We look forward to creating unforgettable memories with you.',
          50, doc.y, { align: 'center', width: 495 }
        );

      doc.end();

      stream.on('finish', () => resolve(`/uploads/${filename}`));
      stream.on('error',  reject);
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { generateQuotePDF };
