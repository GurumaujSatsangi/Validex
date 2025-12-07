async function loadRuns(){
  try {
    const res = await fetch('/api/validation-runs');
    const json = await res.json();
    const table = document.getElementById('runsTbl');
    const spinner = document.querySelector('#runsList .spinner-border');
    
    if (!json.runs || json.runs.length === 0) {
      spinner.style.display = 'none';
      table.style.display = 'table';
      table.querySelector('tbody').innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No validation runs yet. Start one to begin!</td></tr>';
      return;
    }

    spinner.style.display = 'none';
    table.style.display = 'table';
    const tbody = table.querySelector('tbody');
    
    const rows = json.runs.map(r => `
      <tr>
        <td><code>${escapeHtml(String(r.id))}</code></td>
        <td>${r.started_at ? escapeHtml(new Date(r.started_at).toLocaleString()) : '—'}</td>
        <td><span class="badge bg-info">${r.total_providers ?? '—'}</span></td>
        <td><span class="badge bg-secondary">${r.processed ?? '—'}</span></td>
        <td><span class="badge bg-success">${r.success_count ?? '—'}</span></td>
        <td><span class="badge bg-warning text-dark">${r.needs_review_count ?? '—'}</span></td>
        <td>${r.completed_at ? escapeHtml(new Date(r.completed_at).toLocaleString()) : '—'}</td>
        <td>
          <div class="d-flex gap-2">
            ${r.needs_review_count > 0 ? `<button class="btn btn-sm btn-info view-issues-btn" data-run-id="${escapeHtml(String(r.id))}"><i class="bi bi-eye"></i> View Issues</button>` : '<span class="text-muted">No issues</span>'}
            <button class="btn btn-sm btn-outline-danger delete-run-btn" data-run-id="${escapeHtml(String(r.id))}"><i class="bi bi-trash"></i> Delete</button>
          </div>
        </td>
      </tr>`).join('');

    tbody.innerHTML = rows;
  } catch (err) {
    console.error('Error loading runs:', err);
    alert('Error loading validation runs');
  }
}

let isStartingRun = false;

document.getElementById('startRun')?.addEventListener('click', async () => {
  if (isStartingRun) return; // prevent accidental double triggers
  try {
    isStartingRun = true;
    const startBtn = document.getElementById('startRun');
    if (startBtn) startBtn.disabled = true;

    const startTime = Date.now();
    let pollInterval;

    Swal.fire({
      title: 'Running Validation',
      html: `
        <div class="mb-3">
          <div class="progress" style="height: 25px;">
            <div id="validation-progress-bar" class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="width: 0%" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">0%</div>
          </div>
        </div>
        <p id="validation-status" class="text-muted">Initializing validation...</p>
        <p id="validation-eta" class="text-muted small">Estimated time remaining: calculating...</p>
      `,
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        // Poll for progress updates
        pollInterval = setInterval(async () => {
          try {
            const progressRes = await fetch('/api/validation-runs');
            const progressJson = await progressRes.json();
            if (progressJson.runs && progressJson.runs.length > 0) {
              const latestRun = progressJson.runs[0];
              const progress = latestRun.total_providers > 0 ? Math.round((latestRun.processed / latestRun.total_providers) * 100) : 0;
              
              const progressBar = document.getElementById('validation-progress-bar');
              const statusText = document.getElementById('validation-status');
              const etaText = document.getElementById('validation-eta');
              
              if (progressBar) {
                progressBar.style.width = progress + '%';
                progressBar.setAttribute('aria-valuenow', progress);
                progressBar.textContent = progress + '%';
              }
              
              if (statusText) {
                statusText.textContent = `Processing: ${latestRun.processed || 0} of ${latestRun.total_providers || 0} providers`;
              }
              
              // Calculate ETA
              if (etaText && latestRun.processed > 0) {
                const elapsed = Date.now() - startTime;
                const avgTimePerProvider = elapsed / latestRun.processed;
                const remaining = latestRun.total_providers - latestRun.processed;
                const etaMs = remaining * avgTimePerProvider;
                const etaSeconds = Math.ceil(etaMs / 1000);
                const etaMinutes = Math.floor(etaSeconds / 60);
                const etaSecondsRemainder = etaSeconds % 60;
                
                if (etaMinutes > 0) {
                  etaText.textContent = `Estimated time remaining: ${etaMinutes}m ${etaSecondsRemainder}s`;
                } else {
                  etaText.textContent = `Estimated time remaining: ${etaSeconds}s`;
                }
              }
            }
          } catch (err) {
            console.error('Progress poll error:', err);
          }
        }, 1000); // Poll every second
      },
      willClose: () => {
        if (pollInterval) clearInterval(pollInterval);
      }
    });

    const res = await fetch('/api/validation-runs', { method: 'POST' });
    const json = await res.json();
    
    if (pollInterval) clearInterval(pollInterval);

    Swal.close();

    if (!res.ok) {
      Swal.fire({ icon: 'error', title: 'Run Failed', text: json?.error || 'Unknown error' });
      if (startBtn) startBtn.disabled = false;
      isStartingRun = false;
      return;
    }

    await loadRuns();

    Swal.fire({ 
      icon: 'success', 
      title: 'Validation Run Complete!', 
      html: `<p>Run ID: <code>${escapeHtml(String(json.runId || json.id || ''))}</code></p>`,
      confirmButtonText: 'OK'
    });
  } catch (err) {
    Swal.close();
    Swal.fire({ icon: 'error', title: 'Error', text: err?.message || String(err) });
  } finally {
    isStartingRun = false;
    const startBtn = document.getElementById('startRun');
    if (startBtn) startBtn.disabled = false;
  }
});

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Handle clicking View Issues for a run using event delegation
document.addEventListener('click', async (ev) => {
  const deleteBtn = ev.target.closest('.delete-run-btn');
  if (deleteBtn) {
    const runId = deleteBtn.dataset.runId;
    const confirmed = await Swal.fire({
      icon: 'warning',
      title: 'Delete this run?',
      text: 'This will remove the run and its issues.',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel'
    });

    if (!confirmed.isConfirmed) return;

    try {
      const res = await fetch(`/api/validation-runs/${runId}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        Swal.fire('Error', json?.error || 'Could not delete run', 'error');
        return;
      }
      await loadRuns();
      Swal.fire('Deleted', 'Validation run removed', 'success');
    } catch (err) {
      Swal.fire('Error', err?.message || String(err), 'error');
    }
    return;
  }

  const btn = ev.target.closest('.view-issues-btn');
  if (!btn) return;
  
  const runId = btn.dataset.runId;
  try {
    Swal.fire({ 
      title: 'Loading Issues...', 
      didOpen: () => Swal.showLoading(), 
      allowOutsideClick: false 
    });
    
    const res = await fetch(`/api/validation-runs/${runId}/issues`);
    const json = await res.json();
    Swal.close();
    
    const issues = json.issues || [];
    if (issues.length === 0) {
      Swal.fire('No Issues', 'No validation issues found for this run', 'info');
      return;
    }

    // Build Bootstrap-styled HTML table
    let html = `
      <div class="table-responsive" style="max-height: 500px; overflow-y: auto;">
        <table class="table table-sm table-striped" id="issuesModalTable">
          <thead class="table-light">
            <tr>
              <th>Provider</th>
              <th>Field</th>
              <th>Current</th>
              <th>Suggested</th>
              <th>Source</th>
              <th>Confidence</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    for (const it of issues) {
      const providerName = (it.providers && it.providers.name) ? escapeHtml(it.providers.name) : 'N/A';
      const confidence = ((it.confidence || 0) * 100).toFixed(0);
      const isOpen = it.status === 'OPEN';
      const statusBadgeClass = it.status === 'ACCEPTED' ? 'bg-success' : it.status === 'REJECTED' ? 'bg-secondary' : 'bg-warning text-dark';
      const sourceType = it.source_type || 'UNKNOWN';
      
      html += `
        <tr data-issue-id="${escapeHtml(it.id)}">
          <td><a href="/provider/${it.provider_id}" target="_blank" class="text-decoration-none">${providerName}</a></td>
          <td><strong>${escapeHtml(it.field_name)}</strong></td>
          <td>${escapeHtml(it.old_value)}</td>
          <td><span class="badge bg-info">${escapeHtml(it.suggested_value)}</span></td>
          <td><span class="badge ${sourceType === 'NPI_API' ? 'bg-primary' : sourceType === 'AZURE_POI' ? 'bg-info' : sourceType === 'AZURE_MAPS' ? 'bg-cyan' : sourceType === 'SCRAPING_FALLBACK' ? 'bg-warning' : 'bg-secondary'}">${escapeHtml(it.source_type || 'UNKNOWN')}</span></td>
          <td><span class="badge bg-secondary">${confidence}%</span></td>
          <td><span class="badge bg-danger">${escapeHtml(it.severity)}</span></td>
          <td><span class="badge ${statusBadgeClass}">${escapeHtml(it.status)}</span></td>
          <td class="action-cell">
            ${isOpen ? `
              <button class="btn btn-sm btn-success accept-modal-issue" data-issue-id="${escapeHtml(it.id)}" data-provider-id="${it.provider_id}">
                <i class="bi bi-check-circle"></i> Accept
              </button>
              <button class="btn btn-sm btn-danger reject-modal-issue" data-issue-id="${escapeHtml(it.id)}">
                <i class="bi bi-x-circle"></i> Reject
              </button>
            ` : `
              <span class="text-muted">Closed</span>
            `}
          </td>
        </tr>
      `;
    }
    
    html += '</tbody></table></div>';

    Swal.fire({ 
      title: `Issues for Run ${escapeHtml(String(runId))}`, 
      html, 
      width: '90%', 
      confirmButtonText: 'Close',
      didOpen: () => {
        // Allow scrolling inside the modal
        Swal.getHtmlContainer().style.overflowY = 'auto';
        
        // Add event listeners for Accept/Reject buttons in modal
        document.querySelectorAll('.accept-modal-issue').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const issueId = e.currentTarget.dataset.issueId;
            const providerId = e.currentTarget.dataset.providerId;
            e.currentTarget.disabled = true;
            
            try {
              const res = await fetch(`/api/issues/${issueId}/accept`, { method: 'POST' });
              if (!res.ok) {
                const json = await res.json();
                alert('Failed to accept: ' + (json?.error || 'Unknown error'));
                e.currentTarget.disabled = false;
                return;
              }
              
              // Update the row in the modal
              const row = document.querySelector(`tr[data-issue-id="${issueId}"]`);
              if (row) {
                row.querySelector('td:nth-child(8) .badge').className = 'badge bg-success';
                row.querySelector('td:nth-child(8) .badge').textContent = 'ACCEPTED';
                row.querySelector('.action-cell').innerHTML = '<span class="text-muted">Closed</span>';
              }
            } catch (err) {
              alert('Error: ' + err.message);
              e.currentTarget.disabled = false;
            }
          });
        });
        
        document.querySelectorAll('.reject-modal-issue').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const issueId = e.currentTarget.dataset.issueId;
            e.currentTarget.disabled = true;
            
            try {
              const res = await fetch(`/api/issues/${issueId}/reject`, { method: 'POST' });
              if (!res.ok) {
                const json = await res.json();
                alert('Failed to reject: ' + (json?.error || 'Unknown error'));
                e.currentTarget.disabled = false;
                return;
              }
              
              // Update the row in the modal
              const row = document.querySelector(`tr[data-issue-id="${issueId}"]`);
              if (row) {
                row.querySelector('td:nth-child(8) .badge').className = 'badge bg-secondary';
                row.querySelector('td:nth-child(8) .badge').textContent = 'REJECTED';
                row.querySelector('.action-cell').innerHTML = '<span class="text-muted">Closed</span>';
              }
            } catch (err) {
              alert('Error: ' + err.message);
              e.currentTarget.disabled = false;
            }
          });
        });
      }
    });
  } catch (err) {
    Swal.close();
    Swal.fire('Error', err?.message || String(err), 'error');
  }
});

loadRuns();
