export function v3Json(status: number, body: object, origin?: string): Response {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  if (status === 429 || status === 503) headers.set('Retry-After', '60');
  return Response.json(body, { status, headers });
}
