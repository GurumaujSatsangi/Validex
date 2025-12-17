// Main frontend helper
console.log('Validex frontend loaded');

export async function fetchJSON(url, opts){
  const res = await fetch(url, opts);
  return res.json();
}
