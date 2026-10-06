/**
 * Galaxy API Client
 * Connects the Galaxy frontend to the real backend
 */

const API_BASE = 'https://galaxy-backend-production-6a12.up.railway.app/api';

// ── Token management ── (uses sessionStorage for file:// compatibility)
const _store = (() => {
  try { localStorage.setItem('_t','1'); localStorage.removeItem('_t'); return localStorage; }
  catch(e) { return sessionStorage; }
})();

const Auth = {
  getToken: () => _store.getItem('galaxy_token'),
  setToken: (t) => _store.setItem('galaxy_token', t),
  getUser: () => JSON.parse(_store.getItem('galaxy_user') || 'null'),
  setUser: (u) => _store.setItem('galaxy_user', JSON.stringify(u)),
  getBusiness: () => JSON.parse(_store.getItem('galaxy_business') || 'null'),
  setBusiness: (b) => _store.setItem('galaxy_business', JSON.stringify(b)),
  getBusinessId: () => _store.getItem('galaxy_business_id'),
  setBusinessId: (id) => _store.setItem('galaxy_business_id', id),
  clear: () => {
    _store.removeItem('galaxy_token');
    _store.removeItem('galaxy_user');
    _store.removeItem('galaxy_business');
    _store.removeItem('galaxy_business_id');
  },
  isLoggedIn: () => !!_store.getItem('galaxy_token')
};

// ── Core fetch wrapper ──
async function apiFetch(path, options = {}) {
  const token = Auth.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (res.status === 401) {
    Auth.clear();
    window.location.reload();
    return;
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// ══════════════════════════════════════════
// AUTH API
// ══════════════════════════════════════════
const AuthAPI = {
  login: async (login, password) => {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login, password })
  });

    Auth.setToken(data.token);
    Auth.setUser(data.user);
    Auth.setBusiness(data.business);
    return data;
  },

  logout: () => {
    Auth.clear();
    window.location.reload();
  },

  me: () => apiFetch('/auth/me'),

  changePassword: (currentPassword, newPassword) =>
    apiFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    })
};

// ══════════════════════════════════════════
// DASHBOARD API
// ══════════════════════════════════════════
const DashboardAPI = {
  get: () => apiFetch('/dashboard'),
  markAlertRead: (id) => apiFetch(`/dashboard/alerts/${id}/read`, { method: 'PUT' }),
  markAllAlertsRead: () => apiFetch('/dashboard/alerts/read-all', { method: 'PUT' })
};

// ══════════════════════════════════════════
// PRODUCTS API
// ══════════════════════════════════════════
const ProductsAPI = {
  list: () => apiFetch('/products'),

  get: (id) => apiFetch(`/products/${id}`),

  create: (data) => apiFetch('/products', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  update: (id, data) => apiFetch(`/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),

  delete: (id) => apiFetch(`/products/${id}`, { method: 'DELETE' }),

  updateStock: (id, warehouseId, quantity, action, note) =>
    apiFetch(`/products/${id}/stock`, {
      method: 'PUT',
      body: JSON.stringify({ warehouseId, quantity, action, note })
    }),

  transfer: (productId, fromWarehouseId, toWarehouseId, quantity, note) =>
    apiFetch('/products/transfer', {
      method: 'POST',
      body: JSON.stringify({ productId, fromWarehouseId, toWarehouseId, quantity, note })
    }),

  history: (id) => apiFetch(`/products/${id}/history`)
};

// ══════════════════════════════════════════
// WAREHOUSES API
// ══════════════════════════════════════════
const WarehousesAPI = {
  list: () => apiFetch('/warehouses'),

  create: (name, location) => apiFetch('/warehouses', {
    method: 'POST',
    body: JSON.stringify({ name, location })
  }),

  update: (id, data) => apiFetch(`/warehouses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),

  delete: (id) => apiFetch(`/warehouses/${id}`, { method: 'DELETE' })
};

// ══════════════════════════════════════════
// ORDERS API
// ══════════════════════════════════════════
const OrdersAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/orders${q ? '?' + q : ''}`);
  },

  get: (id) => apiFetch(`/orders/${id}`),

  create: (data) => apiFetch('/orders', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  updateStatus: (id, status, reason) => apiFetch(`/orders/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, reason })
  })
};

// ══════════════════════════════════════════
// USERS API
// ══════════════════════════════════════════
const UsersAPI = {
  list: () => apiFetch('/users'),

  create: (data) => apiFetch('/users', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  update: (id, data) => apiFetch(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),

  delete: (id) => apiFetch(`/users/${id}`, { method: 'DELETE' })
};

// ══════════════════════════════════════════
// FINANCE API
// ══════════════════════════════════════════
const FinanceAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/finance${q ? '?' + q : ''}`);
  },

  summary: (month) => apiFetch(`/finance/summary${month ? '?month=' + month : ''}`),

  create: (data) => apiFetch('/finance', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  update: (id, data) => apiFetch(`/finance/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),

  delete: (id) => apiFetch(`/finance/${id}`, { method: 'DELETE' })
};

// ══════════════════════════════════════════
// SETTINGS API
// ══════════════════════════════════════════
const SettingsAPI = {
  get: () => apiFetch('/settings'),

  updateGeneral: (data) => apiFetch('/settings/general', {
    method: 'PUT',
    body: JSON.stringify(data)
  }),

  updateBusiness: (data) => apiFetch('/settings/business', {
    method: 'PUT',
    body: JSON.stringify(data)
  }),

  addDeliveryMethod: (name, price) => apiFetch('/settings/delivery-methods', {
    method: 'POST',
    body: JSON.stringify({ name, price })
  }),

  updateDeliveryMethod: (id, data) => apiFetch(`/settings/delivery-methods/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),

  deleteDeliveryMethod: (id) => apiFetch(`/settings/delivery-methods/${id}`, { method: 'DELETE' }),

  addPaymentMethod: (name) => apiFetch('/settings/payment-methods', {
    method: 'POST',
    body: JSON.stringify({ name })
  }),

  deletePaymentMethod: (id) => apiFetch(`/settings/payment-methods/${id}`, { method: 'DELETE' }),

  addDiscountCode: (code, type, value) => apiFetch('/settings/discount-codes', {
    method: 'POST',
    body: JSON.stringify({ code, type, value })
  }),

  deleteDiscountCode: (id) => apiFetch(`/settings/discount-codes/${id}`, { method: 'DELETE' })
};

// ══════════════════════════════════════════
// UI HELPERS
// ══════════════════════════════════════════

// Show loading state on a button
function btnLoading(btn, loading, originalText) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.original = btn.textContent;
    btn.textContent = 'Loading...';
  } else {
    btn.disabled = false;
    btn.textContent = originalText || btn.dataset.original || btn.textContent;
  }
}

// Show toast notification
function showToast(message, type = 'success') {
  let toast = document.getElementById('galaxy-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'galaxy-toast';
    toast.style.cssText = `
      position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:10px;
      font-size:13px;font-weight:700;font-family:'Rubik',sans-serif;
      z-index:99999;transition:all .3s;box-shadow:0 4px 20px rgba(0,0,0,.15);
      max-width:320px;
    `;
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.background = type === 'success' ? '#16a34a' : type === 'error' ? '#e8220e' : '#1a56db';
  toast.style.color = '#fff';
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
  }, 3000);
}

// Format currency
function formatCurrency(amount, currency = 'LKR') {
  return `${currency} ${Number(amount).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Export everything
window.GalaxyAPI = {
  Auth, AuthAPI, DashboardAPI, ProductsAPI, WarehousesAPI,
  OrdersAPI, UsersAPI, FinanceAPI, SettingsAPI,
  showToast, btnLoading, formatCurrency
};
