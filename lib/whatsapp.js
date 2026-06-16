// WhatsApp notifications disabled
const sendWhatsApp = () => Promise.resolve({ skipped: true });

module.exports = { sendWhatsApp };
