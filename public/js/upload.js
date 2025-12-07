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
      html: `<p><strong>${json.imported}</strong> providers imported successfully.</p>`,
      confirmButtonColor: '#ffe600',
      confirmButtonText: 'View Providers'
    }).then((result) => {
      if (result.isConfirmed) {
        window.location.href = '/providers';
      }
    });

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

    Swal.fire({
      title: 'Processing PDF with OCR',
      html: `
        <div class="mb-3">
          <div class="progress" style="height: 25px;">
            <div id="pdf-progress-bar" class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="width: 0%" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">0%</div>
          </div>
        </div>
        <p id="pdf-status" class="text-muted">Uploading and scanning PDF...</p>
        <p id="pdf-eta" class="text-muted small">Please wait...</p>
      `,
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        // Simulate progress during upload (0-30% during upload, 30-95% during OCR)
        let currentProgress = 0;
        pollInterval = setInterval(() => {
          if (currentProgress < 95) {
            currentProgress += Math.random() * 15;
            if (currentProgress > 95) currentProgress = 95;
            
            const progressBar = document.getElementById('pdf-progress-bar');
            if (progressBar) {
              progressBar.style.width = Math.round(currentProgress) + '%';
              progressBar.setAttribute('aria-valuenow', Math.round(currentProgress));
              progressBar.textContent = Math.round(currentProgress) + '%';
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

