const BASE = import.meta.env.VITE_API_BASE || '';

async function rawFetch(path, opts = {}) {
  const url = `${BASE}${path}`;
  const { headers = {}, body, ...rest } = opts;
  const init = {
    method: opts.method || (body ? 'POST' : 'GET'),
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    ...rest,
  };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) {
    if (res.status === 401) {
      // consumer may handle logout on 401
    }
    const err = new Error((data && data.message) || res.statusText || 'API error');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function api(path, opts = {}) {
  return rawFetch(path, opts);
}

// Specific helpers matching reference/user.service.js
export async function loginApi(username, password) {
  try {
    console.log('[loginApi] Attempting login for user:', username);
    const data = await rawFetch('/login', {
      method: 'POST',
      body: { username, password },
    });
    console.log('[loginApi] Login response received:', data);
    
    // Reference: handleResponse does { user: JSON.parse(data.user), redirectUrl }
    // Backend returns data.user as a JSON STRING that needs to be parsed
    if (data && data.user) {
      try {
        console.log('[loginApi] Parsing user data, type:', typeof data.user);
        const parsedUser = typeof data.user === 'string' ? JSON.parse(data.user) : data.user;
        console.log('[loginApi] User parsed successfully, has token:', !!parsedUser.token);
        return { user: parsedUser, redirectUrl: data.redirectUrl };
      } catch (e) {
        console.error('[loginApi] Failed to parse user data:', e, 'Raw data.user:', data.user);
        throw new Error('Failed to parse user data from server');
      }
    } else {
      console.error('[loginApi] Response missing user field:', data);
      throw new Error('Invalid login response from server');
    }
  } catch (error) {
    console.error('[loginApi] Login failed:', error.message);
    throw error; // Re-throw so AuthProvider can handle it
  }
}

export async function logoutApi() {
  return rawFetch('/logout', { method: 'GET' });
}

export async function sessionCheckApi(user) {
  // Reference: user.service.js sessionCheck - includes authHeader() and user header
  console.log('[sessionCheckApi] Called with user:', user);
  const authHeaders = getAuthHeaders();
  console.log('[sessionCheckApi] Auth headers:', authHeaders);
  const headers = {
    ...authHeaders,
    'Content-Type': 'application/json',
    ...(user ? { user: user.user } : {})
  };
  console.log('[sessionCheckApi] Final headers to send:', headers);
  console.log('[sessionCheckApi] localStorage.user exists:', !!localStorage.getItem('user'));
  try {
    const result = await rawFetch('/sessionCheck', { method: 'GET', headers });
    console.log('[sessionCheckApi] Success:', result);
    return result;
  } catch (error) {
    console.error('[sessionCheckApi] Failed:', error.message, 'Status:', error.status);
    throw error;
  }
}

function getAuthHeaders() {
  console.log('[getAuthHeaders] Called');
  try {
    const raw = localStorage.getItem('user');
    console.log('[getAuthHeaders] localStorage.user raw value:', raw ? raw.substring(0, 100) + '...' : 'NULL');
    if (!raw) return {};
    const u = JSON.parse(raw);
    console.log('[getAuthHeaders] Parsed user:', { hasToken: !!u.token, user: u.user });
    if (u && u.token) {
      const authHeader = { authorization: 'Bearer ' + u.token };
      console.log('[getAuthHeaders] Returning auth header with token:', u.token.substring(0, 20) + '...');
      return authHeader;
    }
  } catch (e) {
    console.error('[getAuthHeaders] Error:', e);
  }
  console.log('[getAuthHeaders] Returning empty object (no token)');
  return {};
}

// PAT (Personal Access Token) API for MCP integration
export async function getPATs() {
  return rawFetch('/api/pats', { method: 'GET', headers: getAuthHeaders() });
}
export async function createPAT({ name, expiresInDays }) {
  return rawFetch('/api/pats/generate', {
    method: 'POST',
    body: { name, expiresInDays },
    headers: getAuthHeaders(),
  });
}
export async function deletePAT(tokenId) {
  return rawFetch(`/api/pats/${tokenId}`, { method: 'DELETE', headers: getAuthHeaders() });
}

export async function getAllUsers() { return rawFetch('/users', { method: 'GET' }); }
export async function getUserById(id) { return rawFetch(`/users/${id}`, { method: 'GET' }); }
export async function registerUser(user) { return rawFetch('/users/register', { method: 'POST', body: user }); }
export async function updateUser(user) { return rawFetch(`/users/${user.id}`, { method: 'PUT', body: user }); }
export async function deleteUser(id) { return rawFetch(`/users/${id}`, { method: 'DELETE' }); }
