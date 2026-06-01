const africastalking = require('africastalking');

/**
 * Initialize Africa's Talking SDK lazily to ensure environment variables are loaded
 * and handle potential formatting issues with the API key.
 */
const getATInstance = () => {
  let apiKey = process.env.AT_API_KEY || '';
  const username = process.env.AT_USERNAME || 'sandbox';

  // Clean the API key: strip 'atsk_' prefix if present as it often causes 401 errors
  // with the standard SDK if not expected.
  if (apiKey.startsWith('atsk_')) {
    apiKey = apiKey.substring(5);
  }

  return africastalking({
    apiKey: apiKey,
    username: username,
  });
};

/**
 * Check if SMS configuration is valid
 * @returns {boolean}
 */
const isSMSConfigured = () => {
  const key = process.env.AT_API_KEY || '';
  const username = process.env.AT_USERNAME || '';
  
  // Skip if placeholders or the specific expired sandbox key is used
  if (!key || 
      key === 'your_api_key' || 
      key === 'your_api_key_here' || 
      key.startsWith('atsk_2cadc0ba860f') || // Specific expired sandbox key
      !username || 
      username === 'sandbox_if_needed' || 
      username === 'your_username_here') {
    return false;
  }
  return true;
};

const sendSMS = async (to, message) => {
  try {
    if (!isSMSConfigured()) {
      console.warn('⚠️ Skipping SMS send: AT_API_KEY or AT_USERNAME not correctly configured in .env');
      return { skipped: true, message: 'Configuration incomplete' };
    }

    const at = getATInstance();
    const sms = at.SMS;
    
    const options = {
      to: [to],
      message: message,
    };

    const response = await sms.send(options);
    console.log('✅ SMS sent successfully:', response);
    return response;
  } catch (error) {
    console.error('❌ Error sending SMS:', error.message || error);
    // Don't throw the error, just return null to prevent crashing the main flow
    return null;
  }
};

module.exports = { sendSMS };
