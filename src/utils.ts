export function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase().trim();
    normalized[lowerKey] = value.replace(/[\r\n]/g, '');
  }
  return normalized;
}

export function jsonResponse(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...(headers ?? {}),
    },
  });
}
