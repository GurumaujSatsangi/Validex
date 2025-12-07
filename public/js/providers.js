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
