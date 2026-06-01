const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const generateQuotePDF = async (data, filename) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const filePath = path.join(__dirname, '../uploads/', filename);
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // Add Logo or Header
      const logoPath = path.join(__dirname, '../../frontend/src/assets/vl.png');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, { fit: [150, 50], align: 'center' });
        doc.moveDown();
      } else {
        doc.fontSize(25).text('VISTAVOYAGE', { align: 'center' });
      }
      doc.fontSize(10).text('Curated Journeys & Exclusive Experiences', { align: 'center' });
      doc.moveDown();

      // Horizontal line
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown();

      doc.fontSize(20).fillColor('#B8860B').text('OFFICIAL QUOTATION', { align: 'left' });
      doc.moveDown();

      doc.fontSize(12).fillColor('black');
      doc.text(`Date: ${new Date().toLocaleDateString()}`);
      doc.text(`Reference: ${data.id}`);
      doc.moveDown();

      doc.fontSize(14).text('Client Information:', { underline: true });
      doc.fontSize(12).text(`Name: ${data.name}`);
      doc.text(`Email: ${data.email}`);
      doc.text(`Phone: ${data.phone}`);
      doc.moveDown();

      if (data.tourTitle) {
        doc.fontSize(14).text('Tour Details:', { underline: true });
        doc.fontSize(12).text(`Package: ${data.tourTitle}`);
        doc.text(`Location: ${data.location}`);
        doc.text(`Duration: ${data.duration}`);
        doc.moveDown();
      }

      doc.fontSize(14).text('Quote Details:', { underline: true });
      doc.fontSize(12).text(data.quote, { align: 'left' });
      doc.moveDown();

      if (data.expiresAt) {
        doc.fillColor('red').text(`This quote expires on: ${new Date(data.expiresAt).toLocaleDateString()}`);
      }

      doc.moveDown(2);
      doc.fillColor('gray').fontSize(10).text('Thank you for choosing VistaVoyage. We look forward to creating memories with you.', { align: 'center' });

      doc.end();

      stream.on('finish', () => {
        resolve(`/uploads/${filename}`);
      });

      stream.on('error', (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { generateQuotePDF };
