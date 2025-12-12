async function loadProviders(){
  try {
    const res = await fetch('/api/providers');
    const json = await res.json();
    const container = document.getElementById('providersContainer');
    
    if (!json.providers || json.providers.length === 0) {
      container.innerHTML = '<div class="alert alert-info" role="alert"><i class="bi bi-info-circle"></i> No providers found. <a href="/upload">Upload a CSV</a> to get started.</div>';
      return;
    }

    const rows = json.providers.map(p => {
      const nameText = escapeHtml(p.name || '');
      return `
        <tr>
          <td><a href="/provider/${p.id}" class="text-decoration-none">${nameText}</a></td>
          <td>${escapeHtml(p.phone || '')}</td>
          <td>${escapeHtml(p.email || '')}</td>
          <td>${escapeHtml(p.city || '')}</td>
          <td>${escapeHtml(p.state || '')}</td>
          <td><span class="badge bg-secondary">${p.issues_count ?? 0}</span></td>
          <td>
            <div class="d-flex gap-2">
              <button class="btn btn-sm btn-info view-provider-btn" data-id="${p.id}"><i class="bi bi-eye"></i> View</button>
              <button class="btn btn-sm btn-outline-danger delete-provider-btn" data-id="${p.id}"><i class="bi bi-trash"></i> Delete</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    const html = `
      <table class="table table-hover table-striped">
        <thead class="table-light">
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>Email</th>
            <th>City</th>
            <th>State</th>
            <th>Issues</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
    
    container.innerHTML = html;
  } catch (err) {
    console.error('Error loading providers:', err);
    document.getElementById('providersContainer').innerHTML = '<div class="alert alert-danger" role="alert"><i class="bi bi-exclamation-triangle"></i> Error loading providers</div>';
  }
}

loadProviders();

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Delete all providers button handler
document.getElementById('deleteAllProvidersBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('deleteAllProvidersBtn');
  const confirmed = await Swal.fire({
    icon: 'warning',
    title: 'Delete All Providers?',
    html: '<p>This will permanently delete <strong>all providers</strong> and their associated validation data.</p><p class="text-danger"><strong>This action cannot be undone.</strong></p>',
    showCancelButton: true,
    confirmButtonText: 'Delete All',
    confirmButtonColor: '#dc3545',
    cancelButtonText: 'Cancel'
  });

  if (!confirmed.isConfirmed) return;

  btn.disabled = true;
  
  try {
    Swal.fire({
      title: 'Deleting...',
      html: '<div class="spinner-border text-danger" role="status"><span class="visually-hidden">Deleting...</span></div>',
      allowOutsideClick: false,
      showConfirmButton: false
    });

    const res = await fetch('/api/providers/delete-all', { method: 'DELETE' });
    
    if (!res.ok) {
      const json = await res.json();
      Swal.close();
      Swal.fire({
        icon: 'error',
        title: 'Delete Failed',
        text: json?.error || 'Could not delete providers'
      });
      btn.disabled = false;
      return;
    }

    Swal.close();
    Swal.fire({
      icon: 'success',
      title: 'All Providers Deleted',
      text: 'All providers have been removed.',
      confirmButtonColor: '#333333'
    }).then(() => {
      loadProviders();
      btn.disabled = false;
    });
  } catch (err) {
    Swal.close();
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: err?.message || String(err)
    });
    btn.disabled = false;
  }
});

// Delegate click for view buttons
document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.view-provider-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  window.location.href = `/provider/${id}`;
});

// Delegate delete buttons
document.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('.delete-provider-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  const confirmed = window.confirm('Delete this provider and its validation data?');
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/providers/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json();
      alert(json?.error || 'Failed to delete provider');
      return;
    }
    await loadProviders();
  } catch (err) {
    alert(err?.message || String(err));
  }
});

// Download CSV button handler
document.getElementById('downloadCsvBtn')?.addEventListener('click', async () => {
  try {
    const btn = document.getElementById('downloadCsvBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Generating...';

    const res = await fetch('/api/providers');
    const json = await res.json();
    
    if (!json.providers || json.providers.length === 0) {
      alert('No providers to download');
      btn.disabled = false;
      btn.innerHTML = originalText;
      return;
    }

    // Create CSV content
    const headers = ['Name', 'Phone', 'Email', 'Address', 'City', 'State', 'ZIP', 'Specialty', 'NPI ID', 'License Number', 'License State', 'License Status', 'Status'];
    const csvRows = [headers.join(',')];
    
    json.providers.forEach(p => {
      const row = [
        `"${(p.name || '').replace(/"/g, '""')}"`,
        `"${(p.phone || '').replace(/"/g, '""')}"`,
        `"${(p.email || '').replace(/"/g, '""')}"`,
        `"${(p.address_line1 || '').replace(/"/g, '""')}"`,
        `"${(p.city || '').replace(/"/g, '""')}"`,
        `"${(p.state || '').replace(/"/g, '""')}"`,
        `"${(p.zip || '').replace(/"/g, '""')}"`,
        `"${(p.speciality || '').replace(/"/g, '""')}"`,
        `"${(p.npi_id || '').replace(/"/g, '""')}"`,
        `"${(p.license_number || '').replace(/"/g, '""')}"`,
        `"${(p.license_state || '').replace(/"/g, '""')}"`,
        `"${(p.license_status || '').replace(/"/g, '""')}"`,
        `"${(p.status || '').replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    
    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const timestamp = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `truelens_providers_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    btn.disabled = false;
    btn.innerHTML = originalText;
  } catch (err) {
    console.error('Download error:', err);
    alert('Failed to download CSV: ' + (err?.message || String(err)));
    const btn = document.getElementById('downloadCsvBtn');
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-download"></i> Download CSV';
  }
});
