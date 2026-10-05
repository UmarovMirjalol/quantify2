const ACCESS_TOKEN_KEY = 'quantllm_access_token';
const CLIENT_ID_KEY = 'quantllm_client_id';

export function getAccessToken(): string {
  return localStorage.getItem(ACCESS_TOKEN_KEY) ?? '';
}

export function setAccessToken(token: string): void {
  if (token.trim()) {
    localStorage.setItem(ACCESS_TOKEN_KEY, token.trim());
  } else {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  }
}

export function clearAccessToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function getClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY);
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
