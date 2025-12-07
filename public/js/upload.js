document.getElementById('uploadForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const file = document.getElementById('csvFile').files[0];
  if (!file) return Swal.fire('Error', 'Select a CSV file', 'error');

  try {
    // Show spinner
    Swal.fire({
      title: 'Importing Data',
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
