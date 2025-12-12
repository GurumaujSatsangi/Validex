document.getElementById('uploadForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const file = document.getElementById('csvFile').files[0];
  if (!file) return Swal.fire('Error', 'Select a CSV file', 'error');

  try {
    // Show progress
    Swal.fire({
      title: 'Importing CSV Data',
      html: '<p>Please wait — processing your CSV file...</p>',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const fd = new FormData();
    fd.append('file', file);

    const res = await fetch('/api/upload/providers', { method: 'POST', body: fd });
    const json = await res.json();

    Swal.close();

    if (!res.ok) {
      Swal.fire({
        icon: 'error',
        title: 'Upload Failed',
        text: json?.error || 'Unknown error occurred',
        confirmButtonColor: '#333333'
      });
      return;
    }

    Swal.fire({
      icon: 'success',
      title: 'Import Successful!',
      html: `<p><strong>${json.imported}</strong> providers imported successfully.</p><p>Starting validation run...</p>`,
      allowOutsideClick: false,
      showConfirmButton: false,
      confirmButtonColor: '#ffe600'
    });

    // Automatically start a validation run with progress tracking
    try {
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

                // Check if completed
                if (latestRun.completed_at) {
                  if (pollInterval) clearInterval(pollInterval);
                  Swal.close();
                  
                  Swal.fire({
                    icon: 'success',
                    title: 'Validation Complete!',
                    html: `<p><strong>${json.imported}</strong> providers validated.</p>`,
                    confirmButtonColor: '#ffe600',
                    confirmButtonText: 'View Results'
                  }).then((result) => {
                    if (result.isConfirmed) {
                      window.location.href = '/runs';
                    }
                  });
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

      const runRes = await fetch('/api/validation-runs', { method: 'POST' });
      const runJson = await runRes.json();

      if (!runRes.ok) {
        if (pollInterval) clearInterval(pollInterval);
        Swal.close();
        Swal.fire({
          icon: 'warning',
          title: 'Import Complete',
          html: `<p><strong>${json.imported}</strong> providers imported.</p><p>Could not auto-start validation. Please start it manually.</p>`,
          confirmButtonColor: '#ffe600',
          confirmButtonText: 'Go to Validation Runs'
        }).then((result) => {
          if (result.isConfirmed) {
            window.location.href = '/runs';
          }
        });
        return;
      }
    } catch (err) {
      Swal.close();
      Swal.fire({
        icon: 'warning',
        title: 'Import Complete',
        html: `<p><strong>${json.imported}</strong> providers imported.</p><p>Error starting validation: ${err?.message || 'Unknown error'}</p>`,
        confirmButtonColor: '#ffe600',
        confirmButtonText: 'Go to Validation Runs'
      }).then((result) => {
        if (result.isConfirmed) {
          window.location.href = '/runs';
        }
      });
    }

    form.reset();
    document.getElementById('uploadResult').innerHTML = '';
  } catch (err) {
    Swal.close();
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: err?.message || String(err),
      confirmButtonColor: '#333333'
    });
  }
});

// PDF Upload Handler
document.getElementById('uploadPdfForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const file = document.getElementById('pdfFile').files[0];
  
  if (!file) {
    return Swal.fire('Error', 'Select a PDF file', 'error');
  }

  if (file.size > 50 * 1024 * 1024) {
    return Swal.fire('Error', 'File size exceeds 50MB limit', 'error');
  }

  try {
        let pollInterval;
    const startTime = Date.now();
    let estimatedTotal = 60000; // Initial estimate: 60 seconds

    Swal.fire({
      title: 'Processing PDF',
      html: `
        <div class="mb-3">
          <div class="progress" style="height: 25px; background-color: #2a2a3a;">
            <div id="pdf-progress-bar" class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="width: 0%; background-color: #ffe600; color: #000;" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">0%</div>
          </div>
        </div>
        <p id="pdf-status" class="text-muted">Uploading and scanning PDF...</p>
        <p id="pdf-eta" class="text-muted small">Estimated time: ~1-2 minutes</p>
      `,
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        // Simulate progress during upload (0-30% during upload, 30-95% during OCR)
        let currentProgress = 0;
        pollInterval = setInterval(() => {
          if (currentProgress < 95) {
            // Slower, more realistic progress
            currentProgress += Math.random() * 5 + 1;
            if (currentProgress > 95) currentProgress = 95;
            
            const progressBar = document.getElementById('pdf-progress-bar');
            const statusText = document.getElementById('pdf-status');
            const etaText = document.getElementById('pdf-eta');
            
            if (progressBar) {
              const percent = Math.round(currentProgress);
              progressBar.style.width = percent + '%';
              progressBar.setAttribute('aria-valuenow', percent);
              progressBar.textContent = percent + '%';
            }
            
            // Calculate ETA
            const elapsed = Date.now() - startTime;
            const estimatedRemaining = Math.max(0, estimatedTotal - elapsed);
            const remainingSeconds = Math.ceil(estimatedRemaining / 1000);
            
            if (statusText) {
              if (currentProgress < 30) {
                statusText.textContent = 'Uploading PDF to server...';
              } else if (currentProgress < 95) {
                statusText.textContent = 'Running OCR on document...';
              }
            }
            
            if (etaText && remainingSeconds > 0) {
              if (remainingSeconds > 60) {
                const minutes = Math.ceil(remainingSeconds / 60);
                etaText.textContent = `Estimated time remaining: ~${minutes} minute${minutes > 1 ? 's' : ''}`;
              } else {
                etaText.textContent = `Estimated time remaining: ~${remainingSeconds} seconds`;
              }
            }
          }
        }, 800);
      }
    });

    const fd = new FormData();
    fd.append('file', file);

    const res = await fetch('/api/upload/providers-pdf', { method: 'POST', body: fd });
    const json = await res.json();

    if (pollInterval) clearInterval(pollInterval);

    Swal.close();

    if (!res.ok) {
      Swal.fire({
        icon: 'error',
        title: 'Upload Failed',
        html: `
          <p><strong>Error:</strong> ${json?.error || 'Unknown error occurred'}</p>
          ${json?.details ? `<small class="text-muted">${json.details}</small>` : ''}
        `,
        confirmButtonColor: '#333333'
      });
      return;
    }

    Swal.fire({
      icon: 'success',
      title: 'PDF Processed Successfully!',
      html: `
        <p>✓ <strong>${json.providersInserted}</strong> providers extracted via OCR</p>
        <p><small>Validation run started: ${json.runId}</small></p>
        <p class="text-muted small">Redirecting to validation runs...</p>
      `,
      confirmButtonColor: '#ffe600',
      confirmButtonText: 'View Validation Runs',
      timer: 3000,
      timerProgressBar: true
    }).then((result) => {
      if (result.isConfirmed || result.dismiss === Swal.DismissReason.timer) {
        window.location.href = '/runs';
      }
    });

    form.reset();
    document.getElementById('uploadPdfResult').innerHTML = '';
  } catch (err) {
    Swal.close();
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: err?.message || String(err),
      confirmButtonColor: '#333333'
    });
  }
});

// Add by NPI Handler
document.getElementById('addNpiForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const npiInput = document.getElementById('npiInput');
  const npi = npiInput.value.trim();

  // Validate NPI format
  if (!/^\d{10}$/.test(npi)) {
    return Swal.fire({
      icon: 'error',
      title: 'Invalid NPI',
      text: 'NPI must be exactly 10 digits',
      confirmButtonColor: '#333333'
    });
  }

  try {
    Swal.fire({
      title: 'Fetching Provider...',
      html: '<p>Looking up NPI Registry and validating provider information...</p>',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const res = await fetch('/api/providers/add-by-npi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ npi })
    });

    const json = await res.json();

    if (!res.ok) {
      let errorMessage = json?.error || 'Unknown error occurred';
      if (res.status === 404) {
        errorMessage = 'Provider not found in NPI Registry';
      } else if (res.status === 409) {
        errorMessage = 'Provider already exists in database';
      }

      Swal.fire({
        icon: 'error',
        title: 'Failed to Add Provider',
        text: errorMessage,
        confirmButtonColor: '#333333'
      });
      return;
    }

    Swal.fire({
      icon: 'success',
      title: 'Provider Added Successfully!',
      html: `
        <p><strong>${json.providerName}</strong></p>
        <p><small>NPI: ${json.npi}</small></p>
        <p class="text-muted small">Validation workflow started. Redirecting to validation runs...</p>
      `,
      confirmButtonColor: '#28a745',
      confirmButtonText: 'View Validation Run',
      timer: 3000,
      timerProgressBar: true
    }).then((result) => {
      if (result.isConfirmed || result.dismiss === Swal.DismissReason.timer) {
        window.location.href = '/runs';
      }
    });

    npiInput.value = '';
    document.getElementById('npiResult').innerHTML = '';
  } catch (err) {
    Swal.close();
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: err?.message || String(err),
      confirmButtonColor: '#333333'
    });
  }
});
