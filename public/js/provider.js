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
    const issuesTbl = document.getElementById('providerIssuesTbl');
    const issuesTbody = issuesTbl.querySelector('tbody');
    const noIssuesMsg = document.getElementById('noIssuesMsg');
    const issues = issuesJson.issues || [];

    if (issues.length === 0) {
      issuesTbl.style.display = 'none';
      noIssuesMsg.classList.remove('d-none');
    } else {
      issuesTbl.style.display = 'table';
      noIssuesMsg.classList.add('d-none');
      issuesTbody.innerHTML = '';
      for (const it of issues) {
        const tr = document.createElement('tr');
        const statusBadgeClass = it.status === 'ACCEPTED' ? 'bg-success' : it.status === 'REJECTED' ? 'bg-secondary' : 'bg-warning text-dark';
        
        tr.innerHTML = `
          <td><strong>${escapeHtml(it.field_name)}</strong></td>
          <td>${escapeHtml(it.old_value)}</td>
          <td><span class="badge bg-info">${escapeHtml(it.suggested_value)}</span></td>
          <td><span class="badge bg-secondary">${(it.confidence * 100).toFixed(0)}%</span></td>
          <td><span class="badge bg-danger">${escapeHtml(it.severity)}</span></td>
          <td><span class="badge ${statusBadgeClass}">${escapeHtml(it.status)}</span></td>
        `;
        issuesTbody.appendChild(tr);
      }
    }
  } catch (err) {
    console.error('Error loading provider:', err);
    document.getElementById('detailsSpinner').style.display = 'none';
    document.getElementById('issuesSpinner').style.display = 'none';
    alert('Error loading provider data');
  }
}

load();
