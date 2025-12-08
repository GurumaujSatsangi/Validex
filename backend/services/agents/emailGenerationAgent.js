/**
 * Email Generation Agent
 * Generates and sends email notifications for validation events
 */

import nodemailer from 'nodemailer';
import { supabase } from '../../supabaseClient.js';

// SMTP Configuration
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || 'your-email@gmail.com',
    pass: process.env.SMTP_PASSWORD || 'your-app-password'
  }
};

const ADMIN_EMAIL = 'gurumaujsatsangi@gmail.com';
const FROM_EMAIL = process.env.SMTP_FROM || 'noreply@truelens.com';

/**
 * Create nodemailer transporter
 */
function createTransporter() {
  try {
    const transporter = nodemailer.createTransport(SMTP_CONFIG);
    return transporter;
  } catch (err) {
    console.error('[Email Agent] Failed to create transporter:', err.message);
    return null;
  }
}

/**
 * Send admin validation summary email after provider validation
 * @param {string} runId - Validation run ID
 * @param {string} providerId - Provider UUID
 */
export async function sendAdminValidationSummaryEmail(runId, providerId) {
  console.log(`[Email Agent] Preparing admin summary email for provider ${providerId}, run ${runId}`);

  try {
    // Fetch provider details
    const { data: provider, error: providerErr } = await supabase
      .from('providers')
      .select('*')
      .eq('id', providerId)
      .single();

    if (providerErr || !provider) {
      console.error('[Email Agent] Failed to fetch provider:', providerErr?.message);
      return;
    }

    // Fetch validation issues
    const { data: issues, error: issuesErr } = await supabase
      .from('validation_issues')
      .select('*')
      .eq('provider_id', providerId)
      .eq('run_id', runId);

    if (issuesErr) {
      console.error('[Email Agent] Failed to fetch issues:', issuesErr.message);
      return;
    }

    const issuesList = issues || [];
    const autoAcceptIssues = issuesList.filter(i => i.action === 'AUTO_ACCEPT');
    const needsReviewIssues = issuesList.filter(i => i.action === 'NEEDS_REVIEW');

    // Generate email content
    const subject = `TrueLens – Validation Summary for Provider ${provider.name} (NPI: ${provider.npi_id || 'N/A'})`;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { background: #007bff; color: white; padding: 20px; border-radius: 5px; }
    .section { margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 5px; }
    .stat { display: inline-block; margin: 10px 20px 10px 0; }
    .stat-label { font-weight: bold; color: #666; }
    .stat-value { font-size: 24px; color: #007bff; }
    .issue { margin: 10px 0; padding: 10px; background: white; border-left: 4px solid #ffc107; }
    .auto-accept { border-left-color: #28a745; }
    .needs-review { border-left-color: #dc3545; }
    .field-name { font-weight: bold; color: #007bff; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #007bff; color: white; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>TrueLens Validation Summary</h1>
      <p>Provider validation completed successfully</p>
    </div>

    <div class="section">
      <h2>Provider Information</h2>
      <table>
        <tr><th>Field</th><th>Value</th></tr>
        <tr><td>Name</td><td>${escapeHtml(provider.name || 'N/A')}</td></tr>
        <tr><td>NPI</td><td>${escapeHtml(provider.npi_id || 'N/A')}</td></tr>
        <tr><td>Specialty</td><td>${escapeHtml(provider.speciality || 'N/A')}</td></tr>
        <tr><td>Phone</td><td>${escapeHtml(provider.phone || 'N/A')}</td></tr>
        <tr><td>Address</td><td>${escapeHtml(provider.address_line1 || 'N/A')}, ${escapeHtml(provider.city || '')}, ${escapeHtml(provider.state || '')} ${escapeHtml(provider.zip || '')}</td></tr>
        <tr><td>Email</td><td>${escapeHtml(provider.email || 'Not available')}</td></tr>
      </table>
    </div>

    <div class="section">
      <h2>Validation Summary</h2>
      <div class="stat">
        <div class="stat-label">Total Issues</div>
        <div class="stat-value">${issuesList.length}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Auto-Accept</div>
        <div class="stat-value" style="color: #28a745;">${autoAcceptIssues.length}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Needs Review</div>
        <div class="stat-value" style="color: #dc3545;">${needsReviewIssues.length}</div>
      </div>
    </div>

    ${issuesList.length > 0 ? `
    <div class="section">
      <h2>Detected Issues</h2>
      ${issuesList.slice(0, 10).map(issue => `
        <div class="issue ${issue.action === 'AUTO_ACCEPT' ? 'auto-accept' : 'needs-review'}">
          <div><span class="field-name">${escapeHtml(issue.field_name)}</span> (${escapeHtml(issue.source_type || 'Unknown Source')})</div>
          <div><strong>Current:</strong> ${escapeHtml(issue.old_value || 'Empty')}</div>
          <div><strong>Suggested:</strong> ${escapeHtml(issue.suggested_value || 'Empty')}</div>
          <div><strong>Confidence:</strong> ${(issue.confidence * 100).toFixed(1)}% | <strong>Action:</strong> ${escapeHtml(issue.action || 'N/A')}</div>
        </div>
      `).join('')}
      ${issuesList.length > 10 ? `<p><em>... and ${issuesList.length - 10} more issues</em></p>` : ''}
    </div>
    ` : '<div class="section"><p>✅ No validation issues detected. All data is accurate.</p></div>'}

    <div class="section">
      <p><strong>Run ID:</strong> ${runId}</p>
      <p><strong>Provider ID:</strong> ${providerId}</p>
      <p><em>This is an automated notification from TrueLens Provider Directory Validation System.</em></p>
    </div>
  </div>
</body>
</html>
    `;

    // Send email
    const transporter = createTransporter();
    if (!transporter) {
      console.error('[Email Agent] Cannot send email - transporter not configured');
      return;
    }

    await transporter.sendMail({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject,
      html: htmlBody
    });

    console.log(`[Email Agent] Admin summary email sent successfully to ${ADMIN_EMAIL}`);

  } catch (err) {
    console.error('[Email Agent] Failed to send admin summary email:', err.message);
  }
}

/**
 * Send discrepancy email to provider requesting confirmation
 * @param {string} providerId - Provider UUID
 * @param {string} runId - Validation run ID
 */
export async function sendProviderDiscrepancyEmail(providerId, runId) {
  console.log(`[Email Agent] Preparing provider discrepancy email for provider ${providerId}`);

  try {
    // Fetch provider details
    const { data: provider, error: providerErr } = await supabase
      .from('providers')
      .select('*')
      .eq('id', providerId)
      .single();

    if (providerErr || !provider) {
      console.error('[Email Agent] Failed to fetch provider:', providerErr?.message);
      return;
    }

    // Check if provider has email
    let providerEmail = provider.email;

    // If no email in provider record, try to fetch from sources
    if (!providerEmail) {
      const { data: sources } = await supabase
        .from('provider_sources')
        .select('raw_data')
        .eq('provider_id', providerId)
        .in('source_type', ['AZURE_POI', 'SCRAPING_ENRICHMENT']);

      if (sources && sources.length > 0) {
        for (const source of sources) {
          if (source.raw_data?.email) {
            providerEmail = source.raw_data.email;
            break;
          }
          if (source.raw_data?.provider_email) {
            providerEmail = source.raw_data.provider_email;
            break;
          }
        }
      }
    }

    if (!providerEmail) {
      console.log('[Email Agent] No provider email found - skipping provider notification');
      return;
    }

    // Fetch validation issues that need review
    const { data: issues, error: issuesErr } = await supabase
      .from('validation_issues')
      .select('*')
      .eq('provider_id', providerId)
      .eq('run_id', runId)
      .or('action.eq.NEEDS_REVIEW,confidence.lt.0.60');

    if (issuesErr) {
      console.error('[Email Agent] Failed to fetch issues:', issuesErr.message);
      return;
    }

    const issuesList = issues || [];

    if (issuesList.length === 0) {
      console.log('[Email Agent] No discrepancies requiring provider review - skipping email');
      return;
    }

    // Generate email content
    const subject = 'Request to verify your provider directory information';

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 700px; margin: 0 auto; padding: 20px; }
    .header { background: #007bff; color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
    .content { padding: 15px; background: #f8f9fa; border-radius: 5px; margin: 15px 0; }
    .discrepancy { margin: 15px 0; padding: 12px; background: white; border-left: 4px solid #ffc107; }
    .field-name { font-weight: bold; color: #007bff; margin-bottom: 5px; }
    .value-row { margin: 5px 0; }
    .footer { margin-top: 30px; padding: 15px; background: #e9ecef; border-radius: 5px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Provider Directory Information Verification Request</h2>
    </div>

    <div class="content">
      <p>Dear ${escapeHtml(provider.name || 'Provider')},</p>
      
      <p>As part of our ongoing efforts to maintain accurate healthcare provider directory information and comply with regulatory requirements, we have performed an automated validation of your listing in our system.</p>
      
      <p>During this validation, we identified some discrepancies between our current records and information from authoritative sources (NPI Registry, state medical boards, and public directories).</p>
    </div>

    <div class="content">
      <h3>Information Requiring Verification</h3>
      <p>Please review the following fields and confirm whether the suggested values are correct:</p>
      
      ${issuesList.map(issue => `
        <div class="discrepancy">
          <div class="field-name">${formatFieldName(issue.field_name)}</div>
          <div class="value-row"><strong>Current value in our system:</strong> ${escapeHtml(issue.old_value || 'Not provided')}</div>
          <div class="value-row"><strong>Information we found:</strong> ${escapeHtml(issue.suggested_value || 'Not available')}</div>
          <div class="value-row" style="font-size: 12px; color: #666;"><em>Source: ${escapeHtml(issue.source_type || 'Multiple sources')}</em></div>
        </div>
      `).join('')}
    </div>

    <div class="content">
      <h3>What we need from you</h3>
      <p>Please reply to this email with:</p>
      <ul>
        <li>Confirmation that the suggested values are correct, OR</li>
        <li>The accurate information for any fields where our suggested values are incorrect</li>
      </ul>
      <p>Your prompt response will help us maintain accurate directory information, which is essential for:</p>
      <ul>
        <li>Patients finding and contacting your practice</li>
        <li>Insurance verification and billing</li>
        <li>Regulatory compliance (CMS network adequacy requirements)</li>
      </ul>
    </div>

    <div class="footer">
      <p><strong>Your current contact information on file:</strong></p>
      <p>
        ${escapeHtml(provider.address_line1 || '')}<br>
        ${escapeHtml(provider.city || '')}, ${escapeHtml(provider.state || '')} ${escapeHtml(provider.zip || '')}<br>
        Phone: ${escapeHtml(provider.phone || 'Not provided')}<br>
        Email: ${escapeHtml(provider.email || 'Not provided')}
      </p>
      <p style="margin-top: 15px;"><em>This verification request was generated by TrueLens Provider Directory Validation System. If you believe you received this email in error, please contact our support team.</em></p>
    </div>
  </div>
</body>
</html>
    `;

    // Send email
    const transporter = createTransporter();
    if (!transporter) {
      console.error('[Email Agent] Cannot send email - transporter not configured');
      return;
    }

    await transporter.sendMail({
      from: FROM_EMAIL,
      to: providerEmail,
      subject,
      html: htmlBody,
      replyTo: ADMIN_EMAIL
    });

    console.log(`[Email Agent] Provider discrepancy email sent successfully to ${providerEmail}`);

  } catch (err) {
    console.error('[Email Agent] Failed to send provider discrepancy email:', err.message);
  }
}

/**
 * HTML escape helper
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format field name for display
 */
function formatFieldName(fieldName) {
  if (!fieldName) return 'Unknown Field';
  return fieldName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}
