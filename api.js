export default async function api(path, { method = 'GET', body } = {}) {
  const t = localStorage.getItem('token');

  const isFormData = body instanceof FormData;

  const r = await fetch('/api' + path, {
    method,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(t ? { Authorization: 'Bearer ' + t } : {})
    },
    body: body
      ? (isFormData ? body : JSON.stringify(body))
      : undefined
  });

  const d = await r.json().catch(() => ({}));

  if (!r.ok) {
    if (r.status === 401 && t) {
      localStorage.clear();
      location.reload();
    }
    throw new Error(d.error || 'Request failed');
  }

  return d;
}