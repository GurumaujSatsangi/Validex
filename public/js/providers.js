async function loadProviders(){
  try {
    const res = await fetch('/api/providers');
    const json = await res.json();
    const container = document.getElementById('providersContainer');
    
    if (!json.providers || json.providers.length === 0) {
      container.innerHTML = '<div class="alert alert-info"><i class="bi bi-info-circle"></i> <div style="flex: 1;">No providers found. <a href="/upload">Upload a CSV</a> to get started.</div></div>';
      return;
    }

    const rows = json.providers.map(p => {
      const nameText = escapeHtml(p.name || '');
      return `
        <tr>
          <td><a href="/provider/${p.id}">${nameText}</a></td>
          <td>${escapeHtml(p.phone || '')}</td>
          <td>${escapeHtml(p.email || '')}</td>
          <td>${escapeHtml(p.city || '')}</td>
          <td>${escapeHtml(p.state || '')}</td>
          <td><span class="badge">${p.issues_count ?? 0}</span></td>
          <td>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-sm btn-info view-provider-btn" data-id="${p.id}"><i class="bi bi-eye"></i> View</button>
              <button class="btn btn-sm btn-outline-danger delete-provider-btn" data-id="${p.id}"><i class="bi bi-trash"></i> Delete</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    const html = `
      <table>
        <thead>
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
    document.getElementById('providersContainer').innerHTML = '<div class="alert alert-danger"><i class="bi bi-exclamation-triangle"></i> <div style="flex: 1;">Error loading providers</div></div>';
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
const deleteAllBtn = document.getElementById('deleteAllProvidersBtn');
console.log('deleteAllBtn element:', deleteAllBtn);

if (deleteAllBtn) {
  deleteAllBtn.addEventListener('click', async () => {
    if (typeof Swal === 'undefined') {
      console.error('SweetAlert not loaded');
      alert('Delete-all UI failed to load. Please refresh and try again.');
      return;
    }
    console.log('Delete all providers button clicked');

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

    deleteAllBtn.disabled = true;
    
    try {
      let progressWidth = 12;
      let progressTimer;

      Swal.fire({
        title: 'Deleting providers',
        html: `
          <div class="delete-progress-track">
            <div id="deleteProgressBar" class="delete-progress-bar" style="width:${progressWidth}%"></div>
          </div>
          <div id="deleteProgressText" class="delete-progress-text">Starting...</div>
        `,
        allowOutsideClick: false,
        showConfirmButton: false,
        didOpen: () => {
          const container = Swal.getHtmlContainer();
          const bar = container?.querySelector('#deleteProgressBar');
          const text = container?.querySelector('#deleteProgressText');
          progressTimer = setInterval(() => {
            progressWidth = Math.min(progressWidth + Math.random() * 12, 90);
            if (bar) bar.style.width = `${progressWidth}%`;
            if (text) text.textContent = progressWidth < 75 ? 'Deleting providers...' : 'Cleaning up related data...';
          }, 450);
        },
        willClose: () => {
          if (progressTimer) clearInterval(progressTimer);
        }
      });

      const res = await fetch('/api/providers/delete-all', { method: 'DELETE' });
      const json = await res.json();
      
      console.log('Delete response:', res.status, json);

      if (!res.ok) {
        Swal.close();
        Swal.fire({
          icon: 'error',
          title: 'Delete Failed',
          text: json?.error || 'Could not delete providers'
        });
        deleteAllBtn.disabled = false;
        return;
      }

      const container = Swal.getHtmlContainer();
      const bar = container?.querySelector('#deleteProgressBar');
      const text = container?.querySelector('#deleteProgressText');
      if (bar) bar.style.width = '100%';
      if (text) text.textContent = 'All providers removed';

      setTimeout(() => {
        Swal.close();
        Swal.fire({
          icon: 'success',
          title: 'All Providers Deleted',
          text: 'All providers have been removed.',
          confirmButtonColor: '#333333'
        }).then(() => {
          loadProviders();
          deleteAllBtn.disabled = false;
        });
      }, 400);

    } catch (err) {
      console.error('Delete all error:', err);
      Swal.close();
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err?.message || String(err)
      });
      deleteAllBtn.disabled = false;
    }
  });
} else {
  console.error('deleteAllProvidersBtn element not found');
}
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
    link.setAttribute('download', `validex_providers_${timestamp}.csv`);
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
