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
      ['License', p.license_number]
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
    const issues = issuesJson.issues || [];

    if (issues.length === 0) {
      issuesList.style.display = 'none';
      issuesSummary.style.display = 'none';
      noIssuesMsg.style.display = 'flex';
    } else {
      issuesList.style.display = 'flex';
      issuesSummary.style.display = 'grid';
      noIssuesMsg.style.display = 'none';
      const total = issues.length;
      const accepted = issues.filter(it => it.status === 'ACCEPTED').length;
      const rejected = issues.filter(it => it.status === 'REJECTED').length;
      const pending = total - accepted - rejected;

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

      issuesList.innerHTML = issues.map(it => {
        const statusBadgeClass = it.status === 'ACCEPTED' ? 'badge-success' : it.status === 'REJECTED' ? 'badge' : 'badge-warning';
        const severityBadgeClass = it.severity === 'HIGH' ? 'badge-danger' : it.severity === 'MEDIUM' ? 'badge-warning' : 'badge-info';
        const severityClass = it.severity === 'HIGH' ? 'severity-high' : it.severity === 'MEDIUM' ? 'severity-medium' : 'severity-low';
        const confidencePct = it.confidence ? Math.round(it.confidence * 100) : 0;

        return `
          <div class="issue-card ${severityClass}">
            <div class="issue-card-header">
              <div>
                <div class="issue-label">Field</div>
                <div class="issue-field">${escapeHtml(it.field_name)}</div>
              </div>
              <div class="issue-badges">
                <span class="badge ${severityBadgeClass}">${escapeHtml(it.severity)}</span>
                <span class="badge badge-info">${confidencePct}%</span>
                <span class="badge ${statusBadgeClass}">${escapeHtml(it.status)}</span>
              </div>
            </div>
            <div class="issue-values">
              <div class="issue-value">
                <div class="issue-value-label">Current</div>
                <div class="issue-value-text">${escapeHtml(it.old_value) || '-'}</div>
              </div>
              <div class="issue-value">
                <div class="issue-value-label">Suggested</div>
                <div class="issue-value-text highlight">${escapeHtml(it.suggested_value) || '-'}</div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error loading provider:', err);
    document.getElementById('detailsSpinner').style.display = 'none';
    document.getElementById('issuesSpinner').style.display = 'none';
    alert('Error loading provider data');
  }
}

load();
