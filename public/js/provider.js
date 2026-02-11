const providerId = window.location.pathname.split('/').pop();

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function load() {
  try {
    const [resP, resIssues] = await Promise.all([
      fetch(`/api/providers/${providerId}`),
      fetch(`/api/providers/${providerId}/issues`)
    ]);

    const p = await resP.json();
    const issuesJson = await resIssues.json();

    // Hide spinners
    document.getElementById('detailsSpinner').style.display = 'none';
    document.getElementById('issuesSpinner').style.display = 'none';

    // Show details table
    const detailsTbl = document.getElementById('providerDetailsTbl');
    detailsTbl.style.display = 'table';
    const tbody = detailsTbl.querySelector('tbody');
    tbody.innerHTML = '';

    const issues = issuesJson.issues || [];
    const getIssueValue = (fieldName) => {
      const normalized = String(fieldName || '').toLowerCase();
      const matches = issues.filter(it => String(it.field_name || '').toLowerCase() === normalized);
      if (matches.length === 0) return null;
      const accepted = matches.find(it => it.status === 'ACCEPTED' || it.status === 'ACCEPTED BY PROVIDER');
      const chosen = accepted || matches[0];
      return chosen.suggested_value ?? null;
    };

    const rows = [
      ['Name', p.name],
      ['NPI', p.npi_id],
      ['Phone', p.phone],
      ['Email', p.email],
      ['Address', p.address_line1],
      ['City', p.city],
      ['State', p.state],
      ['Zip', p.zip],
      ['Speciality', p.speciality],
      ['License', p.license_number],
      ['Certification', p.primary_certification || getIssueValue('certification')],
      ['Appointment Availability', getIssueValue('appointment_availability')],
      ['Availability Status', getIssueValue('availability_status')]
    ];

    for (const r of rows) {
      const tr = document.createElement('tr');
      const tdk = document.createElement('td');
      tdk.innerHTML = `<strong>${escapeHtml(r[0])}</strong>`;
      const tdv = document.createElement('td');
      tdv.innerText = r[1] ?? '';
      tr.appendChild(tdk);
      tr.appendChild(tdv);
      tbody.appendChild(tr);
    }

    // Populate issues
    const issuesList = document.getElementById('providerIssuesList');
    const issuesSummary = document.getElementById('issuesSummary');
    const noIssuesMsg = document.getElementById('noIssuesMsg');
    if (issues.length === 0) {
      issuesList.style.display = 'none';
      issuesSummary.style.display = 'none';
      noIssuesMsg.style.display = 'flex';
    } else {
      issuesList.style.display = 'block';
      issuesSummary.style.display = 'grid';
      noIssuesMsg.style.display = 'none';
      const total = issues.length;
      const accepted = issues.filter(it => it.status === 'ACCEPTED' || it.status === 'ACCEPTED BY PROVIDER').length;
      const rejected = issues.filter(it => it.status === 'REJECTED' || it.status === 'REJECTED BY PROVIDER').length;
      const pending = issues.filter(it => it.status === 'OPEN').length;

      issuesSummary.innerHTML = `
        <div class="issue-pill">
          <div class="pill-label">Total Issues</div>
          <div class="pill-value">${total}</div>
        </div>
        <div class="issue-pill">
          <div class="pill-label">Pending</div>
          <div class="pill-value">${pending}</div>
        </div>
        <div class="issue-pill">
          <div class="pill-label">Accepted</div>
          <div class="pill-value">${accepted}</div>
        </div>
        <div class="issue-pill">
          <div class="pill-label">Rejected</div>
          <div class="pill-value">${rejected}</div>
        </div>
      `;

      // Show/hide Accept All button
      const acceptAllBtn = document.getElementById('acceptAllIssuesBtn');
      if (pending > 0) {
        acceptAllBtn.style.display = 'inline-flex';
      } else {
        acceptAllBtn.style.display = 'none';
      }

      // Create issues table
      issuesList.innerHTML = `
        <table class="issues-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Current Value</th>
              <th>Suggested Value</th>
              <th>Severity</th>
              <th>Confidence</th>
              <th>Status</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            ${issues.map(it => {
              const statusBadgeClass = (it.status === 'ACCEPTED' || it.status === 'ACCEPTED BY PROVIDER') ? 'badge-success' : (it.status === 'REJECTED' || it.status === 'REJECTED BY PROVIDER') ? 'badge' : it.status === 'OPEN' ? 'badge-warning' : 'badge-warning';
              const severityBadgeClass = it.severity === 'HIGH' ? 'badge-danger' : it.severity === 'MEDIUM' ? 'badge-warning' : 'badge-info';
              const confidencePct = it.confidence ? Math.round(it.confidence * 100) : 0;
              const source = it.source_type || it.source || '-';

              return `
                <tr>
                  <td><strong>${escapeHtml(it.field_name)}</strong></td>
                  <td>${escapeHtml(it.old_value) || '<span class="text-muted">Not available</span>'}</td>
                  <td class="suggested-value">${escapeHtml(it.suggested_value) || '<span class="text-muted">-</span>'}</td>
                  <td><span class="badge ${severityBadgeClass}">${escapeHtml(it.severity)}</span></td>
                  <td><span class="badge badge-info">${confidencePct}%</span></td>
                  <td><span class="badge ${statusBadgeClass}">${escapeHtml(it.status)}</span></td>
                  <td><span class="source-badge">${escapeHtml(source)}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }
  } catch (err) {
    console.error('Error loading provider:', err);
    document.getElementById('detailsSpinner').style.display = 'none';
    document.getElementById('issuesSpinner').style.display = 'none';
    alert('Error loading provider data');
  }
}

// Accept All Issues button handler
document.getElementById('acceptAllIssuesBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('acceptAllIssuesBtn');
  const originalHtml = btn.innerHTML;
  
  try {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Processing...';
    
    const res = await fetch(`/api/providers/${providerId}/issues/accept-all`, { method: 'POST' });
    const json = await res.json();
    
    if (!res.ok) {
      alert('Error: ' + (json?.error || 'Failed to accept all issues'));
      btn.innerHTML = originalHtml;
      btn.disabled = false;
      return;
    }
    
    // Show success message
    alert(`✓ Successfully accepted ${json.count} issue(s) and updated provider data!`);
    
    // Reload the page to show updated data
    window.location.reload();
  } catch (err) {
    console.error('Error accepting all issues:', err);
    alert('Error accepting issues: ' + err.message);
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
});

load();
