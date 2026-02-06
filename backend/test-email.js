/**
 * Test script for email functionality
 * 
 * Usage:
 *   node test-email.js
 * 
 * This will test the email configuration and send a test email.
 */

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

async function testEmailConnection() {
  console.log('=== Email Configuration Test ===\n');
  
  // Check environment variables
  console.log('Environment Variables:');
  console.log('  SMTP_HOST:', process.env.SMTP_HOST || 'NOT SET');
  console.log('  SMTP_PORT:', process.env.SMTP_PORT || 'NOT SET');
  console.log('  SMTP_SECURE:', process.env.SMTP_SECURE || 'NOT SET');
  console.log('  SMTP_USER:', process.env.SMTP_USER || 'NOT SET');
  console.log('  SMTP_PASSWORD:', process.env.SMTP_PASSWORD ? '***SET***' : 'NOT SET');
  console.log('  SMTP_FROM:', process.env.SMTP_FROM || 'NOT SET');
  console.log('  ADMIN_EMAIL:', process.env.ADMIN_EMAIL || 'NOT SET');
  console.log('');

  // Create transporter
  const config = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  };

  console.log('Creating SMTP transporter...');
  const transporter = nodemailer.createTransport(config);

  // Verify connection
  console.log('Verifying SMTP connection...');
  try {
    await transporter.verify();
    console.log('✓ SMTP connection verified successfully\n');
  } catch (error) {
    console.error('✗ SMTP connection failed:', error.message);
    console.error('  Please check your SMTP credentials in .env file\n');
    process.exit(1);
  }

  // Send test email
  console.log('Sending test email...');
  const testEmail = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.ADMIN_EMAIL || process.env.SMTP_USER,
    subject: 'Validex Email Test - Configuration Successful',
    html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #28a745; color: white; padding: 20px; border-radius: 5px; text-align: center; }
    .content { padding: 20px; background: #f8f9fa; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✓ Email Configuration Successful</h1>
    </div>
    <div class="content">
      <h2>Test Email Delivered Successfully</h2>
      <p>This is a test email from the Validex Provider Directory Validation System.</p>
      <p>Your email configuration is working correctly and validation run completion emails will be sent automatically.</p>
      <h3>Configuration Details:</h3>
      <ul>
        <li><strong>SMTP Host:</strong> ${config.host}</li>
        <li><strong>SMTP Port:</strong> ${config.port}</li>
        <li><strong>From Address:</strong> ${process.env.SMTP_FROM || process.env.SMTP_USER}</li>
        <li><strong>Admin Email:</strong> ${process.env.ADMIN_EMAIL || process.env.SMTP_USER}</li>
      </ul>
    </div>
    <div class="footer">
      <p>Validex Provider Directory Validation System | Test Email</p>
      <p>${new Date().toISOString()}</p>
    </div>
  </div>
</body>
</html>
    `
  };

  try {
    const info = await transporter.sendMail(testEmail);
    console.log('✓ Test email sent successfully!');
    console.log('  Message ID:', info.messageId);
    console.log('  From:', testEmail.from);
    console.log('  To:', testEmail.to);
    console.log('\n=== Email Test Complete ===');
    console.log('Email functionality is working correctly.');
    console.log('Validation run completion emails will now be sent automatically.\n');
  } catch (error) {
    console.error('✗ Failed to send test email:', error.message);
    console.error('  Please check your SMTP configuration\n');
    process.exit(1);
  }
}

// Run the test
testEmailConnection().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
