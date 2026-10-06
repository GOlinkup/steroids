const nodemailer = require('nodemailer');

// Rate limiting setup
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds
const MAX_REQUESTS_PER_WINDOW = 5; // Maximum 5 submissions per hour
const ipRequestCounts = new Map();

// Email configuration
const createTransporter = () => {
  // For production, use environment variables
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.example.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || 'your-email@example.com',
      pass: process.env.SMTP_PASS || 'your-password',
    },
    connectionTimeout: 5000, // 5-second timeout for connection
    greetingTimeout: 5000,   // 5-second timeout for greeting
    socketTimeout: 5000,     // 5-second timeout for socket
  });
};

// Validate email format
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Sanitize input to prevent injection attacks
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return '';
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// Check rate limit for an IP
const checkRateLimit = (ip) => {
  const now = Date.now();

  // Clean up old entries
  for (const [storedIp, data] of ipRequestCounts.entries()) {
    if (now - data.timestamp > RATE_LIMIT_WINDOW) {
      ipRequestCounts.delete(storedIp);
    }
  }

  // Check if IP exists in the map
  if (!ipRequestCounts.has(ip)) {
    ipRequestCounts.set(ip, { count: 1, timestamp: now });
    return true;
  }

  // Check if rate limit exceeded
  const data = ipRequestCounts.get(ip);
  if (data.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  // Increment count
  data.count += 1;
  return true;
};

exports.handler = async (event, context) => {
  // Set up CORS headers for local development
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle OPTIONS request (preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ message: 'Method not allowed' }),
    };
  }

  // Get client IP for rate limiting
  const clientIP = event.headers['client-ip'] ||
                  event.headers['x-forwarded-for'] ||
                  'unknown';

  // Check rate limit
  if (!checkRateLimit(clientIP)) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
    };
  }

  try {
    // Parse request body
    const data = JSON.parse(event.body);

    // Log the received data for debugging
    console.log('Received feedback data:', JSON.stringify(data));

    // Check for missing fields and provide a detailed error
    const missingFields = [];
    if (!data.name) missingFields.push('name');
    if (!data.email) missingFields.push('email');
    if (!data.feedbackType) missingFields.push('feedbackType');
    if (!data.message) missingFields.push('message');

    if (missingFields.length > 0) {
      const errorMsg = `Missing required fields: ${missingFields.join(', ')}`;
      console.error(errorMsg);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: errorMsg }),
      };
    }

    // Validate email format
    if (!isValidEmail(data.email)) {
      const errorMsg = `Invalid email format: ${data.email}`;
      console.error(errorMsg);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: errorMsg }),
      };
    }

    // Validate message length
    if (data.message.length < 10) {
      const errorMsg = `Feedback message is too short (${data.message.length} chars, minimum 10)`;
      console.error(errorMsg);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: errorMsg }),
      };
    }

    // Sanitize inputs
    const sanitizedData = {
      name: sanitizeInput(data.name),
      email: sanitizeInput(data.email),
      phone: sanitizeInput(data.phone || 'Not provided'),
      feedbackType: sanitizeInput(data.feedbackType),
      message: sanitizeInput(data.message),
      timestamp: new Date().toISOString(),
    };

    // Check if we're in development mode
    // Use SEND_EMAILS_IN_DEV to override and send emails in development
    const isDevelopment = (process.env.NODE_ENV === 'development' || !process.env.NETLIFY) &&
                         process.env.SEND_EMAILS_IN_DEV !== 'true';

    try {
      // Create email transporter
      const transporter = createTransporter();

      // Email to admin
      const adminMailOptions = {
        from: process.env.SMTP_USER || 'your-email@example.com',
        to: process.env.ADMIN_EMAIL || 'admin@example.com',
        subject: `New Feedback: ${sanitizedData.feedbackType} from ${sanitizedData.name}`,
        html: `
          <h2>New Feedback Submission</h2>
          <p><strong>Type:</strong> ${sanitizedData.feedbackType}</p>
          <p><strong>From:</strong> ${sanitizedData.name}</p>
          <p><strong>Email:</strong> ${sanitizedData.email}</p>
          <p><strong>Phone:</strong> ${sanitizedData.phone}</p>
          <p><strong>Submitted:</strong> ${sanitizedData.timestamp}</p>
          <h3>Message:</h3>
          <p>${sanitizedData.message}</p>
        `,
      };

      // Email to a user
      const userMailOptions = {
        from: process.env.SMTP_USER || 'your-email@example.com',
        to: sanitizedData.email,
        subject: 'Thank you for your feedback',
        html: `
          <h2>Thank you for your feedback!</h2>
          <p>We have received your ${sanitizedData.feedbackType} feedback and will review it shortly.</p>
          <p>Here's a copy of your message:</p>
          <blockquote>${sanitizedData.message}</blockquote>
          <p>We appreciate your input and will get back to you if needed.</p>
          <p>Best regards,<br>The Gesture Canvas Team</p>
        `,
      };

      // In development mode, log the emails instead of sending them
      if (isDevelopment) {
        console.log('Development mode: Email would be sent with the following details:');
        console.log('Admin email:', adminMailOptions);
        console.log('User email:', userMailOptions);
      } else {
        // Send emails in production
        try {
          console.log('Attempting to send admin email...');
          const adminInfo = await transporter.sendMail(adminMailOptions);
          console.log('Admin email sent successfully:', adminInfo.response);

          console.log('Attempting to send user email...');
          const userInfo = await transporter.sendMail(userMailOptions);
          console.log('User email sent successfully:', userInfo.response);
        } catch (sendError) {
          console.error('Detailed email sending error:', sendError);
          console.error('SMTP Configuration:', {
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: process.env.SMTP_SECURE === 'true',
            user: process.env.SMTP_USER ? '(set)' : '(not set)',
            pass: process.env.SMTP_PASS ? '(set)' : '(not set)',
            admin: process.env.ADMIN_EMAIL || '(not set)'
          });
          throw sendError;
        }
      }
    } catch (emailError) {
      console.error('Error sending email:', emailError);

      // In development, we'll still return success to allow testing the UI
      if (isDevelopment) {
        console.log('Development mode: Returning success despite email error');
      } else {
        throw emailError; // Re-throw in production
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Feedback submitted successfully' }),
    };
  } catch (error) {
    console.error('Error processing feedback:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
