const ACCESS_TOKEN_KEY = 'quantify_access_token';
const CLIENT_ID_KEY = 'quantify_client_id';
const LEGACY_ACCESS_TOKEN_KEY = 'quantllm_access_token';
const LEGACY_CLIENT_ID_KEY = 'quantllm_client_id';

/** Clean pasted secrets (tokens / API keys). */
export function normalizeSecret(value: string): string {
  let v = value.replace(/^\uFEFF/, '').trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  if (/^bearer\s+/i.test(v)) {
    v = v.replace(/^bearer\s+/i, '').trim();
  }
  return v.replace(/\s+/g, '');
}

export function normalizeStrategyText(value: string): string {
  let v = value.replace(/^\uFEFF/, '').trim();
  v = v.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v.replace(/[ \t]+/g, ' ').trim();
}

export function getAccessToken(): string {
  const current = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (current) return current;
  const legacy = localStorage.getItem(LEGACY_ACCESS_TOKEN_KEY);
  if (legacy) {
    localStorage.setItem(ACCESS_TOKEN_KEY, legacy);
    localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
    return legacy;
  }
  return '';
}

export function setAccessToken(token: string): void {
  const cleaned = normalizeSecret(token);
  if (cleaned) {
    localStorage.setItem(ACCESS_TOKEN_KEY, cleaned);
    localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  } else {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  }
}

export function clearAccessToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
}

export function getClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = localStorage.getItem(LEGACY_CLIENT_ID_KEY);
    if (id) {
      localStorage.setItem(CLIENT_ID_KEY, id);
      localStorage.removeItem(LEGACY_CLIENT_ID_KEY);
    }
  }
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, '');
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Client-Id': getClientId(),
  };
  const token = getAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}
