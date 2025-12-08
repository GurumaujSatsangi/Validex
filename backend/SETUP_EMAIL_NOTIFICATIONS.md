# Email Notifications Setup Guide

## Overview
The TrueLens system now supports automated email notifications for provider validation workflows. This guide explains how to configure email functionality.

## Features
- **Admin Summary Email**: Sent to `gurumaujsatsangi@gmail.com` after each validation run with:
  - Provider details and validation statistics
  - List of discrepancies found
  - Links to view provider and validation run details

- **Provider Discrepancy Email**: Conditionally sent to providers when issues are found with:
  - Professional verification request
  - List of specific discrepancies
  - Contact information for corrections

## Email Configuration

### 1. Setup SMTP Credentials

Add the following variables to your `.env` file:

```env
# Email Configuration (for validation notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@truelens.com
```

### 2. Gmail Configuration (Recommended)

If using Gmail:

1. Go to your Google Account settings
2. Navigate to Security → 2-Step Verification
3. Scroll to "App passwords"
4. Generate a new app password for "Mail"
5. Use this 16-character password as `SMTP_PASSWORD`

**Important**: Never use your actual Gmail password. Always use an app-specific password.

### 3. Alternative SMTP Providers

You can use any SMTP provider by updating the configuration:

**SendGrid:**
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASSWORD=your-sendgrid-api-key
```

**Mailgun:**
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@your-domain.mailgun.org
SMTP_PASSWORD=your-mailgun-password
```

**AWS SES:**
```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-ses-smtp-username
SMTP_PASSWORD=your-ses-smtp-password
```

## Email Triggers

### Admin Email (Always Sent)
- Triggered after every validation run completes
- Contains summary of all validation results
- Sent to: `gurumaujsatsangi@gmail.com`

### Provider Email (Conditional)
- Only sent when discrepancies are found
- Conditions: `status = 'NEEDS_REVIEW'` OR `confidence < 0.60`
- Sent to: Provider's email (extracted from Azure POI or web scraping)

## Testing Email Functionality

### 1. Add Provider by NPI
Visit: `http://localhost:5000/add-provider`

Enter a valid 10-digit NPI and submit. This will:
1. Fetch provider details from NPI Registry
2. Create provider record in database
3. Run validation workflow
4. Send admin email
5. Send provider email (if discrepancies found)

### 2. Check Email Logs
Monitor the backend console for email-related logs:
```
[Email Generation] Admin email sent successfully to gurumaujsatsangi@gmail.com
[Email Generation] Provider email sent successfully to provider@example.com
[Email Generation] Failed to send admin email: Error message
```

### 3. Verify Email Delivery
- Check admin inbox: gurumaujsatsangi@gmail.com
- Check spam/junk folder if not received
- Verify SMTP credentials are correct
- Check SMTP provider logs/dashboard

## Error Handling

Email failures DO NOT break the validation workflow. If email sending fails:
- Error is logged to console
- Validation continues normally
- Provider records are still updated
- User receives success response

This ensures system reliability even when email service is unavailable.

## Troubleshooting

### Email Not Received
1. Check SMTP credentials in `.env`
2. Verify SMTP provider allows the connection
3. Check spam/junk folders
4. Review backend console logs for errors
5. Test SMTP credentials with a simple nodemailer test script

### Provider Email Not Sent
1. Verify provider has an email address in database
2. Check if validation found discrepancies (`NEEDS_REVIEW` or confidence < 0.60)
3. Confirm email extraction is working (check logs)
4. Verify provider email is valid format

### Gmail Specific Issues
- Enable "Less secure app access" (not recommended) OR use app password
- Check Google account for blocked sign-in attempts
- Verify 2-Step Verification is enabled for app passwords
- Ensure daily sending limits not exceeded (500 emails/day for Gmail)

## Email Template Customization

Email templates are defined in:
`backend/services/agents/emailGenerationAgent.js`

To customize:
1. Locate the `sendAdminValidationSummaryEmail()` or `sendProviderDiscrepancyEmail()` function
2. Modify the HTML template in the `mailOptions.html` field
3. Update styling, content, or branding as needed
4. Restart the server to apply changes

## Security Best Practices

1. **Never commit `.env` file** - Keep SMTP credentials secret
2. **Use app-specific passwords** - Never use main account password
3. **Rotate credentials regularly** - Change passwords periodically
4. **Monitor email logs** - Watch for unusual activity
5. **Rate limiting** - Be aware of SMTP provider sending limits
6. **Validate email addresses** - Ensure provider emails are legitimate

## Future Enhancements

Potential improvements for email system:
- Email send history table for tracking
- Retry mechanism for failed sends
- Email queue for high-volume processing
- Custom templates per validation type
- Admin dashboard for email settings
- Unsubscribe functionality for providers
- Email delivery confirmation tracking

## Support

For issues or questions about email configuration:
- Check backend console logs for detailed error messages
- Review SMTP provider documentation
- Verify `.env` file configuration matches provider requirements
- Test with simple nodemailer script to isolate issues
