// Store all providers for filtering
let allProviders = [];
let currentFilter = 'all';
let currentSearch = '';

async function loadProviders(){
  try {
    const res = await fetch('/api/providers');
    const json = await res.json();
    const container = document.getElementById('providersContainer');
    
    if (!json.providers || json.providers.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <i class="bi bi-inbox"></i>
          </div>
          <div class="empty-title">No Providers Yet</div>
          <div class="empty-text">No providers found. <a href="/upload" style="color: #007bff; text-decoration: none; font-weight: 500;">Upload a CSV</a> to get started.</div>
        </div>
      `;
      allProviders = [];
      updateResultsCount(0);
      return;
    }

    allProviders = json.providers;
    renderProviders(allProviders);
  } catch (err) {
    console.error('Error loading providers:', err);
    document.getElementById('providersContainer').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" style="color: #dc3545;">
          <i class="bi bi-exclamation-triangle"></i>
        </div>
        <div class="empty-title">Error Loading Providers</div>
        <div class="empty-text">Failed to load providers. Please refresh the page and try again.</div>
      </div>
    `;
  }
}

function renderProviders(providers) {
  const container = document.getElementById('providersContainer');
  
  if (!providers || providers.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <i class="bi bi-search"></i>
        </div>
        <div class="empty-title">No Providers Found</div>
        <div class="empty-text">No providers match your search or filter criteria.</div>
      </div>
    `;
    updateResultsCount(0);
    return;
  }

  const rows = providers.map(p => {
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
            <button class="btn btn-sm btn-info view-provider-btn" data-id="${p.id}" style="padding: 6px 14px; border-radius: 8px; font-weight: 600; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 6px; border: none; cursor: pointer; transition: all 0.2s ease;"><i class="bi bi-eye"></i> View</button>
            <button class="btn btn-sm btn-outline-danger delete-provider-btn" data-id="${p.id}" style="padding: 6px 14px; border-radius: 8px; font-weight: 600; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #dc3545; cursor: pointer; transition: all 0.2s ease;"><i class="bi bi-trash"></i> Delete</button>
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
  updateResultsCount(providers.length);
}

function updateResultsCount(count) {
  const resultsCount = document.getElementById('resultsCount');
  if (resultsCount) {
    resultsCount.textContent = count;
  }
}

function filterProviders() {
  let filtered = [...allProviders];

  // Apply search filter
  if (currentSearch.trim()) {
    const searchLower = currentSearch.toLowerCase();
    filtered = filtered.filter(p => {
      const name = (p.name || '').toLowerCase();
      const npi = (p.npi_id || '').toLowerCase();
      const specialty = (p.speciality || '').toLowerCase();
      return name.includes(searchLower) || npi.includes(searchLower) || specialty.includes(searchLower);
    });
  }

  // Apply issue filter
  if (currentFilter === 'has-issues') {
    filtered = filtered.filter(p => (p.issues_count ?? 0) > 0);
  } else if (currentFilter === 'no-issues') {
    filtered = filtered.filter(p => (p.issues_count ?? 0) === 0);
  }

  renderProviders(filtered);
}

loadProviders();

// Search functionality
const searchInput = document.getElementById('providerSearch');
const searchBtn = document.getElementById('searchBtn');
const clearSearchBtn = document.getElementById('clearSearchBtn');

if (searchBtn) {
  searchBtn.addEventListener('click', () => {
    currentSearch = searchInput.value;
    filterProviders();
  });
}

if (searchInput) {
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      currentSearch = searchInput.value;
      filterProviders();
    }
  });
}

if (clearSearchBtn) {
  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    currentSearch = '';
    currentFilter = 'all';
    updateFilterButtons();
    renderProviders(allProviders);
  });
}

// Filter button functionality
document.addEventListener('click', (e) => {
  const filterBtn = e.target.closest('.filter-btn');
  if (!filterBtn) return;

  currentFilter = filterBtn.dataset.filter;
  updateFilterButtons();
  filterProviders();
});

function updateFilterButtons() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    if (btn.dataset.filter === currentFilter) {
      btn.style.background = '#007bff';
      btn.style.color = 'white';
      btn.style.borderColor = '#007bff';
    } else {
      btn.style.background = 'white';
      btn.style.color = '#333';
      btn.style.borderColor = '#d0d0d0';
    }
  });
}

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
