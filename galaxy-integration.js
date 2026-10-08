/**
 * Galaxy Integration Layer
 * ========================
 * This file connects Galaxy.html to the real backend API.
 * Add these two lines to Galaxy.html <head> (AFTER Google Fonts, BEFORE </head>):
 *
 *   <script src="api.js"></script>
 *   <script src="galaxy-integration.js"></script>
 *
 * That's the ONLY change needed in Galaxy.html.
 */

(function () {
  'use strict';

  const API = window.GalaxyAPI;

  // ══════════════════════════════════════════════════
  // 1. LOGIN — Add Business ID field & wire to real API
  // ══════════════════════════════════════════════════

  /**
   * Patch the login screen to add Business ID field and use real API
   */
  function patchLoginScreen() {
  // Business ID removed — login by username or email only
}

  /**
   * Override the fake doLogin() with a real API call
   */
  window.doLogin = async function () {
    const login    = (document.getElementById('l-user')?.value || '').trim();
    const password =  document.getElementById('l-pass')?.value || '';
    const errEl    =  document.getElementById('login-err');  

    const btn = document.querySelector('.login-box button[onclick="doLogin()"], .login-box button');
    if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }

    try {
      const data = await API.AuthAPI.login(login, password);

      // Map backend user to the shape Galaxy.html expects
      const user = {
        id:       data.user.id,
        name:     data.user.firstName + ' ' + data.user.lastName,
        username: data.user.username,
        role:     data.user.role,
        bizId: data.user.businessId,
      };

      if (errEl) errEl.classList.remove('show');
      // Galaxy's built-in session + UI flow
      sessionStorage.setItem(window.SESSION_KEY || 'galaxy_user', JSON.stringify(user));
      if (window._stopGalaxy) window._stopGalaxy();
      // Call showApp — try window.showApp first, fall back to direct call
      if (typeof window.showApp === 'function') {
        window.showApp(user);
      } else {
        // showApp not yet exposed; trigger it manually
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-shell').style.display = 'flex';
        if (typeof window.applyUser === 'function') window.applyUser(user);
        if (typeof window.applyBizName === 'function') window.applyBizName();
        if (typeof window.initApp === 'function') window.initApp();
      }
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message === 'Invalid credentials' ? 'Wrong username or password.' : (err.message || 'Login failed.');
        errEl.classList.add('show');
      }
      document.getElementById('l-pass').value = '';
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
    }
  };

  /**
   * Override doLogout to also clear JWT
   */
  window.doLogout = function () {
    API.Auth.clear();
    sessionStorage.removeItem(window.SESSION_KEY || 'galaxy_user');
    window.currentUser = null;
    const lUser = document.getElementById('l-user');
    const lPass = document.getElementById('l-pass');
    if (lUser) lUser.value = '';
    if (lPass) lPass.value = '';
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
  };

  // ══════════════════════════════════════════════════
  // 2. DATA LOADING — Replace fake arrays on initApp
  // ══════════════════════════════════════════════════

  /**
   * Load all real data from backend and replace fake arrays
   */
  async function loadRealData() {
    try {
      // Load in parallel for speed
      const [warehousesRes, productsRes, ordersRes, settingsRes, usersRes, financeRes] = await Promise.allSettled([
        API.WarehousesAPI.list(),
        API.ProductsAPI.list(),
        API.OrdersAPI.list({ limit: 200 }),
        API.SettingsAPI.get(),
        API.UsersAPI.list(),
        API.FinanceAPI.list({ limit: 500 }),
      ]);

      // ── Warehouses ──
      if (warehousesRes.status === 'fulfilled' && warehousesRes.value) {
        const whList = Array.isArray(warehousesRes.value) ? warehousesRes.value : (warehousesRes.value.warehouses || []);
        window.warehouses = whList.map(w => ({
          id:       w.id,
          name:     w.name,
          location: w.location || '',
          manager:  w.manager_name || '',
          active:   w.is_active !== false,
          type:     w.type || 'Distribution',
        }));
      }

      // ── Products ──
      if (productsRes.status === 'fulfilled' && productsRes.value) {
        const prodList = Array.isArray(productsRes.value) ? productsRes.value : (productsRes.value.products || []);
        window.products = prodList.map(p => {
          // Convert stock_levels array to {warehouseId: qty} map
          const stock = {};
          if (p.stock_levels) {
            p.stock_levels.forEach(sl => { stock[sl.warehouse_id] = sl.quantity; });
          }
          return {
            id:       p.id,
            name:     p.name,
            code:     p.code || p.sku || '',
            price:    p.selling_price,
            pp:       p.purchase_price,
            stock:    stock,
            low:      p.low_stock_threshold || 3,
            sold:     p.total_sold || 0,
            dt:       p.created_at ? formatDateDMY(p.created_at) : '',
            on:       p.is_active !== false,
            images:   p.images || [],
            cat:      p.category || '',
            desc:     p.description || '',
            _raw:     p,
          };
        });
      }

      // ── Orders ──
      if (ordersRes.status === 'fulfilled' && ordersRes.value) {
        const orderList = Array.isArray(ordersRes.value) ? ordersRes.value : (ordersRes.value.orders || []);
        window.orders = orderList.map(mapApiOrder);
      }

      // ── Settings ──
      if (settingsRes.status === 'fulfilled' && settingsRes.value) {
        const s = settingsRes.value;
        const gs = window.generalSettings || {};
        window.generalSettings = {
          ...gs,
          currency:          s.settings?.currency || 'LKR',
          timezone:          s.settings?.timezone || 'Asia/Colombo',
          dateFormat:        s.settings?.date_format || 'DD.MM.YYYY',
          timeFormat:        s.settings?.time_format || '24hr',
          lowStockThreshold: s.settings?.low_stock_threshold || 5,
          emailAlerts:       s.settings?.email_alerts !== false,
          orderAlerts:       s.settings?.order_alerts !== false,
          bizName:           s.business?.name || gs.bizName || '',
          bizCategory:       s.business?.category || gs.bizCategory || '',
          bizAddress:        s.business?.address || gs.bizAddress || '',
          bizPhone:          s.business?.phone || gs.bizPhone || '',
          deliveryMethods:   (s.deliveryMethods || []).map(d => ({ id: d.id, name: d.name, price: d.price || 0 })),
          paymentMethods:    (s.paymentMethods  || []).map(m => m.name),
          discountCodes:     (s.discountCodes   || []).map(dc => ({ id: dc.id, code: dc.code, type: dc.type, value: dc.value })),
        };
        // Update biz name in sidebar/topbar
            if (typeof window.applyBizName === 'function') window.applyBizName();
        // Update UI dropdowns to match loaded settings
            setTimeout(function() {
             var tzEl = document.getElementById('gs-tz');
             if (tzEl) tzEl.value = window.generalSettings.timezone;
             var fmtEl = document.getElementById('gs-timefmt');
             if (fmtEl) fmtEl.value = window.generalSettings.timeFormat;
             var curEl = document.getElementById('gs-currency');
             if (curEl) curEl.value = window.generalSettings.currency;
             }, 500);
          }

      // ── System Users ──
      if (usersRes.status === 'fulfilled' && usersRes.value) {
        const userList = Array.isArray(usersRes.value) ? usersRes.value : (usersRes.value.users || []);
        window.systemUsers = userList.map(u => ({
          id:        u.id,
          firstName: u.first_name,
          lastName:  u.last_name,
          username:  u.username,
          email:     u.email||'',
          password:  '',  // never sent from backend
          role:      u.role,
          status:    u.status !== false,
          lastLogin: u.last_login ? formatDateDMY(u.last_login) : '—',
          commission: { on: u.commission_on||false, method: u.commission_method||'percent', percent: u.commission_percent||0, perUnit: u.commission_per_unit||0, minCapOn: u.commission_min_cap_on||false, minCap: u.commission_min_cap||0 },
        }));
        if (typeof window.renderUsersPage === 'function') {
          const usersSection = document.getElementById('page-users');
          if (usersSection && usersSection.classList.contains('active')) {
            window.renderUsersPage();
          }
        }
      }

      // ── Finance ──
      if (financeRes.status === 'fulfilled' && financeRes.value) {
        const finList = Array.isArray(financeRes.value) ? financeRes.value : (financeRes.value.expenditures || []);
        window.financeExpenditures = finList.map(f => ({
          id:     f.id,
          month:  f.month,
          label:  f.label,
          amount: f.amount,
          type:   'expense',
        }));
      }

      // Re-render all visible pages with real data
      if (typeof window.renderProducts      === 'function') window.renderProducts();
      if (typeof window.renderDashboardPage === 'function') window.renderDashboardPage();
      if (typeof window.renderWhMain        === 'function') window.renderWhMain();
      if (typeof window.renderWarehousePage === 'function') window.renderWarehousePage();

      // Load KNOX announcements & notifications into Galaxy UI
      await loadKnoxAnnouncements();

      // Sync into Galaxy's local variables and re-render all pages
      try {
        if (window.products && window.products.length) {
          products = window.products;
          if (typeof window.renderProducts === 'function') window.renderProducts();
        }
        if (window.orders && window.orders.length) {
          orders = window.orders;
        }
      } catch(e) {}

      console.log('✅ Galaxy: real data loaded');
    } catch (err) {
      console.error('Galaxy data load error:', err);
      API.showToast('Could not load data from server. Using offline mode.', 'error');
    }
  }

  // ══════════════════════════════════════════════════
  // 3. PATCH initApp to load real data after UI init
  // ══════════════════════════════════════════════════

  const _origInitApp = window.initApp;
  window.initApp = function () {
    if (_origInitApp) _origInitApp();
    // Load real data in background, then refresh UI
    loadRealData();
  };

  // ══════════════════════════════════════════════════
  // 4. PRODUCTS — wire Add / Edit / Delete / Toggle
  // ══════════════════════════════════════════════════

  /**
   * Patch submitProduct to call real API
   */
  setTimeout(function() { window.submitProduct = async function () {
    const name = document.getElementById('f-name')?.value.trim();
    const pp   = parseFloat(document.getElementById('f-purchase')?.value) || 0;
    const sp   = parseFloat(document.getElementById('f-selling')?.value)  || 0;
    const code = document.getElementById('f-code')?.value.trim();
    const low  = parseInt(document.getElementById('f-low')?.value)  || 3;
    const desc = document.getElementById('f-desc')?.value?.trim()  || '';

    const red = [];
    if (!name) red.push('Product name is required.');
    if (!pp)   red.push('Purchase price is required.');
    if (!sp)   red.push('Selling price is required.');

    // Stock per warehouse
    const stock_levels = [];
    let totalQty = 0;
    (window.warehouses || []).forEach(w => {
      const qty = parseInt(document.getElementById('wh-' + w.id)?.value) || 0;
      if (qty > 0) stock_levels.push({ warehouse_id: w.id, quantity: qty, action: 'set' });
      totalQty += qty;
    });
    if (totalQty === 0) red.push('Total quantity is 0 — please add stock to at least one warehouse.');

    if (typeof window.showNote === 'function') window.showNote('red', red);
    if (red.length) return;

    const btn = document.querySelector('#page-addproduct button[onclick="submitProduct()"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
      const payload = {
        name, sku: code, description: desc,
        purchase_price: pp, selling_price: sp,
        low_stock_threshold: low,
        is_active: window.productOn !== false,
        stock_levels,
      };

      const res = await API.ProductsAPI.create(payload);
      API.showToast('Product added!', 'success');

      // Backend returns { product: {...} } or the product object directly
      const savedProduct = res.product || res;

      // Add to local array immediately for instant UI update
      const newProd = {
        id:    savedProduct.id,
        name, code, price: sp, pp, stock: {}, low, sold: 0,
        dt: formatDateDMY(new Date().toISOString()), on: window.productOn !== false,
      };
      stock_levels.forEach(sl => { newProd.stock[sl.warehouse_id] = sl.quantity; });
      (window.products || []).unshift(newProd);

      setTimeout(() => {
        ['f-name','f-code','f-desc','f-purchase','f-selling'].forEach(id => {
          const el = document.getElementById(id); if (el) el.value = '';
        });
        const fLow = document.getElementById('f-low'); if (fLow) fLow.value = '5';
        (window.warehouses || []).forEach(w => {
          const el = document.getElementById('wh-' + w.id); if (el) el.value = '0';
        });
        window.images = [window.PLACEHOLDER || ''];
        if (typeof window.renderImages === 'function') window.renderImages();
        window.codeManual = false;
        if (typeof window.autoCalc    === 'function') window.autoCalc();
        if (typeof window.showNote    === 'function') window.showNote('red', []);
        window.navigate('itemstock');
      }, 1200);
    } catch (err) {
      API.showToast(err.message || 'Failed to save product.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Add Product'; }
    }
  }; }, 500);

  /**
   * Patch toggleOn to call real API
   */
  const _origToggleOn = window.toggleOn;
  window.toggleOn = async function (id) {
    const p = (window.products || []).find(x => x.id === id);
    if (!p) return;
    const newStatus = !p.on;
    p.on = newStatus; // optimistic
    if (typeof window.renderProducts === 'function') window.renderProducts();
    try {
      await API.ProductsAPI.update(id, { is_active: newStatus });
    } catch (err) {
      p.on = !newStatus; // revert
      if (typeof window.renderProducts === 'function') window.renderProducts();
      API.showToast('Could not update status.', 'error');
    }
  };

  /**
   * Patch deleteSelected to call real API
   */
  const _origDeleteSelected = window.deleteSelected;
  window.deleteSelected = async function () {
    const sel = window.pSel;
    if (!sel || !sel.size) { API.showToast('Select rows first.', 'error'); return; }
    if (!confirm('Delete ' + sel.size + ' product(s)? This cannot be undone.')) return;

    const ids = [...sel];
    sel.clear();

    let failed = 0;
    await Promise.all(ids.map(async id => {
      try {
        await API.ProductsAPI.delete(id);
        window.products = (window.products || []).filter(p => p.id !== id);
      } catch {
        failed++;
      }
    }));

    if (typeof window.renderProducts === 'function') window.renderProducts();
    if (failed) API.showToast(failed + ' product(s) could not be deleted.', 'error');
    else API.showToast('Deleted successfully.', 'success');
  };

  // ══════════════════════════════════════════════════
  // 5. STOCK — Refill (openRefill modal save)
  // ══════════════════════════════════════════════════

  /**
   * Patch saveRefill if it exists
   */
  function patchRefill() {
    const _orig = window.saveRefill;
    if (!_orig) return;
    window.saveRefill = async function () {
      // Read values from the refill modal (original logic to collect them)
      const pid       = window._refillPid;
      const whId      = document.getElementById('rf-wh')?.value;
      const action    = document.getElementById('rf-action')?.value || 'add';
      const qty       = parseInt(document.getElementById('rf-qty')?.value)  || 0;
      const note      = document.getElementById('rf-note')?.value?.trim() || '';

      if (!pid || !whId || qty <= 0) { API.showToast('Please fill all fields.', 'error'); return; }

      try {
        await API.ProductsAPI.updateStock(pid, whId, qty, action, note);
        // Update local stock
        const p = (window.products || []).find(x => x.id === pid);
        if (p) {
          const cur = p.stock[whId] || 0;
          if (action === 'set') p.stock[whId] = qty;
          else if (action === 'add') p.stock[whId] = cur + qty;
          else if (action === 'remove') p.stock[whId] = Math.max(0, cur - qty);
        }
        document.getElementById('m-refill')?.classList.remove('open');
        if (typeof window.renderProducts === 'function') window.renderProducts();
        API.showToast('Stock updated!', 'success');
      } catch (err) {
        API.showToast(err.message || 'Stock update failed.', 'error');
      }
    };
  }

  // ══════════════════════════════════════════════════
  // 6. ORDERS — Create & Status update
  // ══════════════════════════════════════════════════

  /**
   * Patch submitOrder to call real API
   */
  const _origSubmitOrder = window.submitOrder;
  window.submitOrder = async function () {
    // Collect order data from current UI state
    const customerName    = document.getElementById('c-name')?.value.trim()    || '';
    const customerPhone   = document.getElementById('c-phone1')?.value.trim()  || '';
    const customerPhone2  = document.getElementById('c-phone2')?.value.trim()  || '';
    const customerCity    = document.getElementById('c-city')?.value.trim()    || '';
    const customerAddress = document.getElementById('c-address')?.value.trim() || '';
    const customerEmail   = document.getElementById('c-email')?.value.trim()   || '';
    const customerNote    = document.getElementById('c-note')?.value.trim()    || '';
    const deliveryId      = document.getElementById('o-delivery')?.value       || '';
    const paymentMethod   = document.getElementById('o-payment')?.value        || '';
    const discountCode    = document.getElementById('o-discount-code')?.value?.trim() || '';

    // orderItems is mirrored into window._galaxyOrderItems by patchOrderItems()
    let items = window._galaxyOrderItems || [];

    const red = [];
    if (!customerName)  red.push('Customer name is required.');
    if (!customerPhone) red.push('Phone number is required.');
    if (!items.length)  red.push('Add at least one product to the order.');
    if (!paymentMethod) red.push('Select a payment method.');

    const noteEl = document.getElementById('order-note');
    if (red.length) {
      if (noteEl) {
        noteEl.classList.add('show');
        const li = noteEl.querySelector('ul,div');
        if (li) li.innerHTML = red.map(r => '<div>' + r + '</div>').join('');
      }
      return;
    }
    if (noteEl) noteEl.classList.remove('show');

    // Find delivery method details
    const delivMethods = window.generalSettings?.deliveryMethods || [];
    const dm = delivMethods.find(d => String(d.id) === String(deliveryId) || d.name === deliveryId);
    const deliveryName  = dm ? dm.name  : (deliveryId || 'No Delivery');
    const deliveryPrice = dm ? dm.price : 0;

    const btn = document.querySelector('#page-placeorder button[onclick="submitOrder()"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Placing…'; }

    try {
      const payload = {
        customer_name:    customerName,
        customer_phone:   customerPhone,
        customer_phone2:  customerPhone2,
        customer_city:    customerCity,
        customer_address: customerAddress,
        customer_email:   customerEmail,
        note:             customerNote,
        delivery_method:  deliveryName,
        delivery_cost:    deliveryPrice,
        payment_method:   paymentMethod,
        discount_code:    discountCode || null,
        items: items.map(i => ({
          product_id: i.pid || i.id,
          quantity:   i.qty,
          unit_price: i.sp || i.price,
        })),
      };

      const res = await API.OrdersAPI.create(payload);

      // Add to local orders array for instant UI
      const newOrder = mapApiOrder(res.order || res);
      if (!window.orders) window.orders = [];
      window.orders.unshift(newOrder);
      // Sync into Galaxy's local variable so the orders page shows it
      try { orders = window.orders; } catch(e) {}

      API.showToast('Order placed! ' + (res.order?.order_code || res.order_code || ''), 'success');

      setTimeout(() => {
        if (typeof window.initOrder === 'function') window.initOrder();
        if (typeof window.renderOrdersPage === 'function') window.renderOrdersPage();
        window.navigate('manageorders');
      }, 1200);
    } catch (err) {
      API.showToast(err.message || 'Order failed.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Submit'; }
    }
  };

  /**
   * Patch order status updates
   */
  const _origUpdateOrderStatus = window.updateOrderStatus || window.changeOrderStatus;
  window._realUpdateOrderStatus = async function (orderId, newStatus, reason) {
    try {
      await API.OrdersAPI.updateStatus(orderId, newStatus, reason || '');
      // Update local array
      const o = (window.orders || []).find(x => x.id === orderId || x.code === orderId);
      if (o) { o.status = newStatus; if (reason) o.reason = reason; }
      if (typeof window.renderOrdersPage === 'function') window.renderOrdersPage();
      API.showToast('Order status updated.', 'success');
    } catch (err) {
      API.showToast(err.message || 'Status update failed.', 'error');
    }
  };

  // ══════════════════════════════════════════════════
  // 7. WAREHOUSES — Create / Edit / Delete
  // ══════════════════════════════════════════════════

  /**
   * Patch saveNewWarehouse
   */
  function patchWarehouses() {
    const _origSave = window.saveNewWarehouse;
    if (_origSave) {
      window.saveNewWarehouse = async function () {
        const name = document.getElementById('nw-name')?.value.trim();
        const loc  = document.getElementById('nw-loc')?.value.trim()  || '';
        if (!name) { API.showToast('Warehouse name required.', 'error'); return; }
        try {
          const res = await API.WarehousesAPI.create(name, loc);
          const w = res.warehouse || res;
          (window.warehouses || []).push({ id: w.id, name: w.name, location: w.location || loc, active: true });
          document.getElementById('m-addwh')?.classList.remove('open');
          if (typeof window.renderWarehousePage === 'function') window.renderWarehousePage();
          if (typeof window.buildWhFields       === 'function') window.buildWhFields();
          API.showToast('Warehouse added!', 'success');
        } catch (err) {
          API.showToast(err.message || 'Could not add warehouse.', 'error');
        }
      };
    }

    const _origEdit = window.saveEditWarehouse;
    if (_origEdit) {
      window.saveEditWarehouse = async function () {
        const wid  = window.editWhId;
        const name = document.getElementById('ef-name')?.value.trim();
        const loc  = document.getElementById('ef-loc')?.value.trim()  || '';
        const mgr  = document.getElementById('ef-mgr')?.value.trim()  || '';
        const type = document.getElementById('ef-type')?.value || 'Distribution';
        const act  = document.getElementById('ef-status-tgl')?.classList.contains('on');
        try {
          await API.WarehousesAPI.update(wid, { name, location: loc, is_active: act });
          const w = (window.warehouses || []).find(x => x.id === wid);
          if (w) { w.name = name; w.location = loc; w.manager = mgr; w.type = type; w.active = act; }
          document.getElementById('m-editwh')?.classList.remove('open');
          if (typeof window.renderWarehousePage === 'function') window.renderWarehousePage();
          if (typeof window.buildWhFields       === 'function') window.buildWhFields();
          API.showToast('Warehouse updated!', 'success');
        } catch (err) {
          API.showToast(err.message || 'Could not update warehouse.', 'error');
        }
      };
    }
  }

  // ══════════════════════════════════════════════════
  // 8. USERS — Add / Edit / Delete
  // ══════════════════════════════════════════════════

  function patchUsers() {
    window.saveNewUser = async function () {
      const fn   = document.getElementById('nu-first')?.value.trim();
      const ln   = document.getElementById('nu-last')?.value.trim();
      const un   = document.getElementById('nu-user')?.value.trim();
      const pw   = document.getElementById('nu-pass')?.value;
      const role = document.getElementById('nu-role')?.value;
      if (!fn || !ln || !un || !pw || !role) { API.showToast('All fields required.', 'error'); return; }
      try {
        const res = await API.UsersAPI.create({ firstName: fn, lastName: ln, username: un, password: pw, role });
        const u = res.user || res;
        if (!window.systemUsers) window.systemUsers = [];
        window.systemUsers.push({ id: u.id, firstName: fn, lastName: ln, username: un, password: '', role, status: true, lastLogin: '—' });
        document.getElementById('m-adduser')?.classList.remove('open');
        if (typeof window.renderUsersPage === 'function') window.renderUsersPage();
        API.showToast('User added!', 'success');
      } catch (err) {
        API.showToast(err.message || 'Could not add user.', 'error');
      }
    };

    window.deleteUser = async function (id) {
      if (!confirm('Delete this user?')) return;
      try {
        await API.UsersAPI.delete(id);
        window.systemUsers = (window.systemUsers || []).filter(u => u.id !== id);
        if (typeof window.renderUsersPage === 'function') window.renderUsersPage();
        API.showToast('User deleted.', 'success');
      } catch (err) {
        API.showToast(err.message || 'Could not delete user.', 'error');
      }
    };

    window.toggleUserStatus = async function (id) {
      const u = (window.systemUsers || []).find(x => x.id === id);
      if (!u) return;
      const newStatus = !u.status;
      u.status = newStatus;
      if (typeof window.renderUsersPage === 'function') window.renderUsersPage();
      try {
        await API.UsersAPI.update(id, { status: newStatus });
      } catch (err) {
        u.status = !newStatus;
        if (typeof window.renderUsersPage === 'function') window.renderUsersPage();
        API.showToast('Could not update user status.', 'error');
      }
    };
  }

  // ══════════════════════════════════════════════════
  // 9. SETTINGS — Save general & business settings
  // ══════════════════════════════════════════════════

  function patchSettings() {
    const _origSave = window.saveGeneralSettings;
    if (_origSave) {
      window.saveGeneralSettings = async function () {
        // Let original collect values into generalSettings first
        // Read currency directly from dropdown before origSave
        var _currencyEl = document.getElementById('gs-currency');
        if (_currencyEl && _currencyEl.value) {
        window.generalSettings = window.generalSettings || {};
        window.generalSettings.currency = _currencyEl.value;
        }
        _origSave();
       const gs = window.generalSettings || {};
        try {
          await Promise.all([
            API.SettingsAPI.updateGeneral({
              currency:            gs.currency,
              timezone:            gs.timezone,
              date_format:         gs.dateFormat,
              time_format:         gs.timeFormat,
              low_stock_threshold: gs.lowStockThreshold,
              email_alerts:        gs.emailAlerts,
              order_alerts:        gs.orderAlerts,
            }),
            API.SettingsAPI.updateBusiness({
              name:     gs.bizName,
              category: gs.bizCategory,
              address:  gs.bizAddress,
              phone:    gs.bizPhone,
            }),
          ]);
          API.showToast('Settings saved!', 'success');
        } catch (err) {
          API.showToast('Settings saved locally (sync failed).', 'info');
        }
      };
    }
  }

  // ══════════════════════════════════════════════════
  // 10. FINANCE — Add / Edit / Delete expenditures
  // ══════════════════════════════════════════════════

  function patchFinance() {
    const _origAdd = window.saveFinanceEntry;
    if (_origAdd) {
      window.saveFinanceEntry = async function () {
        const label  = document.getElementById('fe-label')?.value.trim();
        const amount = parseFloat(document.getElementById('fe-amount')?.value) || 0;
        const month  = document.getElementById('fe-month')?.value || window.activeFinanceMonth;
        if (!label || !amount) { API.showToast('Label and amount required.', 'error'); return; }
        try {
          const res = await API.FinanceAPI.create({ label, amount, month, type: 'expense' });
          const entry = res.expenditure || res;
          (window.financeExpenditures || []).push({ id: entry.id, month, label, amount, type: 'expense' });
          document.getElementById('m-addfinance')?.classList.remove('open');
          if (typeof window.renderFinancePage === 'function') window.renderFinancePage();
          API.showToast('Expense added!', 'success');
        } catch (err) {
          API.showToast(err.message || 'Could not add expense.', 'error');
        }
      };
    }

    const _origDel = window.deleteFinanceEntry;
    if (_origDel) {
      window.deleteFinanceEntry = async function (id) {
        try {
          await API.FinanceAPI.delete(id);
          window.financeExpenditures = (window.financeExpenditures || []).filter(f => f.id !== id);
          if (typeof window.renderFinancePage === 'function') window.renderFinancePage();
          API.showToast('Deleted.', 'success');
        } catch (err) {
          API.showToast(err.message || 'Could not delete entry.', 'error');
        }
      };
    }
  }

  // ══════════════════════════════════════════════════
  // 11. DASHBOARD — Load real stats from API
  // ══════════════════════════════════════════════════

  /**
   * After dashboard renders, also fetch live stats to overlay on top
   */
  const _origRenderDashboard = window.renderDashboardPage;
  window.renderDashboardPage = function () {
    if (_origRenderDashboard) _origRenderDashboard();
    // Async fetch live dashboard stats
    API.DashboardAPI.get().then(data => {
      if (!data) return;
      // Update the stat cards if they're rendered
      safeSetText('db-total-products',  data.stats?.totalProducts);
      safeSetText('db-low-stock',       data.stats?.lowStockCount);
      safeSetText('db-today-sales',     data.stats?.todaySales != null ? formatCurrencyLocal(data.stats.todaySales) : null);
      safeSetText('db-today-orders',    data.stats?.todayOrderCount);
      safeSetText('db-month-sales',     data.stats?.monthSales != null ? formatCurrencyLocal(data.stats.monthSales) : null);
      safeSetText('db-month-orders',    data.stats?.monthOrderCount);

      // Update alerts from real backend
      if (data.alerts && data.alerts.length) {
        window.alertsList = data.alerts.map(a => ({
          id:     a.id,
          type:   a.type,
          title:  a.title,
          detail: a.detail || '',
          time:   a.created_at ? new Date(a.created_at).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' }) : '',
          date:   a.created_at ? formatDateDMY(a.created_at) : '',
          read:   a.is_read || false,
        }));
        if (typeof window.updateAlertBadge === 'function') window.updateAlertBadge();
      }
    }).catch(() => {}); // fail silently — offline mode already has fake data
  };

  // ══════════════════════════════════════════════════
  // 12. HELPERS
  // ══════════════════════════════════════════════════

  function formatDateDMY(isoOrDate) {
    try {
      const d = new Date(isoOrDate);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yy = d.getFullYear();
      return dd + '.' + mm + '.' + yy;
    } catch { return '—'; }
  }

  function formatCurrencyLocal(amount) {
    const cur = window.generalSettings?.currency || 'LKR';
    return cur + ' ' + Number(amount).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function safeSetText(id, value) {
    if (value == null) return;
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  /**
   * Map a backend order object to the shape Galaxy.html expects
   */
  function mapApiOrder(o) {
    return {
      id:       o.code || o.id,
      code:     o.code || ('ORD-' + String(o.id).padStart(3, '0')),
      customer: o.customer_name || '',
      phone:    o.customer_phone || '',
      phone2:   o.customer_phone2 || '',
      city:     o.customer_city || '',
      address:  o.customer_address || '',
      email:    o.customer_email || '',
      items:    (o.items || o.order_items || []).map(i => ({
        name: i.product_name || i.name || '',
        code: i.product_sku  || i.code || '',
        qty:  i.quantity,
        pp:   i.purchase_price || i.pp || 0,
        sp:   i.unit_price    || i.sp || 0,
      })),
      delivery: o.delivery_method
        ? o.delivery_method + (o.delivery_cost > 0 ? ' — LKR ' + o.delivery_cost : '')
        : 'No Delivery',
      payment:  o.payment_method || '',
      discount: o.discount_amount || 0,
      status:   o.status || 'processing',
      reason:   o.status_reason || '',
      date:     o.created_at ? formatDateDMY(o.created_at) : '',
      time:     o.created_at ? new Date(o.created_at).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
      addedBy: (o.added_by_name || o.created_by_name || '').trim(),
      note:     o.note || '',
      _raw:     o,
    };
  }

  // Expose mapApiOrder globally (used in order status patch)
  window._mapApiOrder = mapApiOrder;

  // ══════════════════════════════════════════════════
  // 13. KNOX ANNOUNCEMENTS & NOTIFICATIONS
  //     Loads images + notifications from KNOX Client
  //     Manager and injects them into Galaxy.html
  // ══════════════════════════════════════════════════

  async function loadKnoxAnnouncements() {
    try {
      const res = await fetch('https://galaxy-backend-production-6a12.up.railway.app/api/knox-admin/announcements', {
        headers: { 'x-knox-admin-key': 'KNOX_Admin_Galaxy_2026_SecureKey' }
      });
      if (!res.ok) return;
      const data = await res.json();

      // ── 1. Announcement image slides ──
      const images = (data.announcements || []).filter(Boolean); // remove nulls
      if (images.length && Array.isArray(window.ANN_SLIDES)) {
        // Replace the fake slides with real ones from KNOX Client Manager
        window.ANN_SLIDES.length = 0;
        images.forEach(src => window.ANN_SLIDES.push(src));
        // Re-render slide if dashboard is already showing
        if (typeof window.annSliderRender === 'function') {
          window.annSlideIdx = 0;
          window.annSliderRender();
          window.annSliderStart();
        }
        // Show banner if images exist
        if (typeof window.annShowBanner === 'function') window.annShowBanner();
      }

      // ── 2. Notifications → Galaxy alert panel ──
      const notifications = data.notifications || [];
      if (notifications.length && Array.isArray(window.alertsList)) {
        notifications.forEach(n => {
          // Avoid duplicates
          const alreadyAdded = window.alertsList.some(a => a._knoxId === n.id);
          if (alreadyAdded) return;
          window.alertsList.unshift({
            id: (window.alertIdCtr || 100) + n.id,
            _knoxId: n.id,
            type: 'info',
            msg: `<b>${n.title}</b> — ${n.message}`,
            date: n.date || new Date().toISOString().slice(0, 10),
            read: false
          });
        });
        // Refresh the alert badge and panel
        if (typeof window.renderAlertBadge === 'function') window.renderAlertBadge();
        if (typeof window.renderAlertList === 'function') window.renderAlertList();
      }
    } catch (e) {
      // Silently fail — not critical
    }
  }

  // ══════════════════════════════════════════════════
  // 14. BOOT — run after DOM is ready
  // ══════════════════════════════════════════════════

  function patchOrderItems() {
    const _origAdd = window.addOrderItem;

    function _mirrorItem(pid, warehouseId, stocks) {
      if (!window._galaxyOrderItems) window._galaxyOrderItems = [];
      const existing = window._galaxyOrderItems.find(x => x.pid === pid);
      if (existing) {
        existing.qty = (existing.qty || 1) + 1;
        if (stocks) existing.stocks = stocks;
      } else {
        window._galaxyOrderItems.push({ pid, qty: 1, customPrice: null, warehouse_id: warehouseId || null, stocks: stocks || [] });
      }
      if (typeof window.renderOrderItems === 'function') window.renderOrderItems();
    }

    window.addOrderItem = function(pid) {
      const token = localStorage.getItem('galaxy_token');
      const baseUrl = 'https://galaxy-backend-production-6a12.up.railway.app';
      if (_origAdd) _origAdd(pid);
      fetch(baseUrl + '/api/warehouses/stock/' + pid, {
        headers: { 'Authorization': 'Bearer ' + token }
      }).then(function(r) { return r.json(); }).then(function(stockData) {
        const stocks = Array.isArray(stockData) ? stockData.filter(function(s) { return s.quantity > 0; }) : [];
        _mirrorItem(pid, stocks[0] ? stocks[0].warehouse_id : null, stocks);
      }).catch(function() {
        _mirrorItem(pid, null, []);
      });
    };

    const _origInit = window.initOrder;
    window.initOrder = function() {
      window._galaxyOrderItems = [];
      if (_origInit) _origInit();
    };

    // Navigate patch - show "—" on Place Order page
    const _origNavigate = window.navigate;
    window.navigate = function(page) {
      if (_origNavigate) _origNavigate(page);
      if (page === 'placeorder') {
        setTimeout(function() {
          const idEl = document.getElementById('o-id');
          if (idEl) idEl.textContent = '—';
        }, 100);
      }
    };
    window._integrationSubmitOrder = async function() {
  const customerName    = document.getElementById('c-name')?.value.trim()     || '';
  const customerPhone   = document.getElementById('c-phone1')?.value.trim()   || '';
  const customerPhone2  = document.getElementById('c-phone2')?.value.trim()   || '';
  const customerCity    = document.getElementById('c-city')?.value.trim()     || '';
  const customerAddress = document.getElementById('c-address')?.value.trim()  || '';
  const customerEmail   = document.getElementById('c-email')?.value.trim()    || '';
  const customerNote    = document.getElementById('c-note')?.value.trim()     || '';
  const deliveryId      = document.getElementById('o-delivery')?.value        || '';
  const paymentMethod   = document.getElementById('o-payment')?.value         || '';
  const discountCode    = document.getElementById('o-discount-code')?.value?.trim() || '';

  let items = window._galaxyOrderItems || [];

  const red = [];
  if (!customerName)  red.push('Customer name is required.');
  if (!customerPhone) red.push('Phone number is required.');
  if (!items.length)  red.push('Add at least one product to the order.');
  if (!paymentMethod) red.push('Select a payment method.');

  const noteEl = document.getElementById('order-note');
  if (red.length) {
    if (noteEl) {
      noteEl.classList.add('show');
      const li = noteEl.querySelector('ul,div');
      if (li) li.innerHTML = red.map(r => '<div>' + r + '</div>').join('');
    }
    return;
  }
  if (noteEl) noteEl.classList.remove('show');

  const delivMethods = window.generalSettings?.deliveryMethods || [];
  const dm = delivMethods.find(d => String(d.id) === String(deliveryId) || d.name === deliveryId);
  const deliveryName  = dm ? dm.name  : (deliveryId || 'No Delivery');
  const deliveryPrice = dm ? dm.price : 0;

  const btn = document.querySelector('#page-placeorder button[onclick="submitOrder()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Placing…'; }

  try {
    const payload = {
      customer_name:    customerName,
      customer_phone:   customerPhone,
      customer_phone2:  customerPhone2,
      customer_city:    customerCity,
      customer_address: customerAddress,
      customer_email:   customerEmail,
      note:             customerNote,
      delivery_method:  deliveryName,
      delivery_cost:    deliveryPrice,
      payment_method:   paymentMethod,
      discount_code:    discountCode || null,
      items: items.map(i => ({
        product_id: i.pid || i.id,
        quantity:   i.qty,
        unit_price: i.sp || i.price,
      })),
    };

    const res = await API.OrdersAPI.create(payload);

    const newOrder = mapApiOrder(res.order || res);
    if (!window.orders) window.orders = [];
    window.orders.unshift(newOrder);
    try { orders = window.orders; } catch(e) {}

    API.showToast('Order placed! ' + (res.order?.order_code || res.order_code || ''), 'success');

    setTimeout(() => {
      if (typeof window.initOrder === 'function') window.initOrder();
      if (typeof window.renderOrdersPage === 'function') window.renderOrdersPage();
      window.navigate('manageorders');
    }, 1200);
  } catch (err) {
    API.showToast(err.message || 'Order failed.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Submit'; }
  }
};
    // Intercept submit button click before Galaxy's inline onclick runs
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('button[onclick="submitOrder()"]');
      if (btn) {
        e.stopImmediatePropagation();
        e.preventDefault();
        window._integrationSubmitOrder();
      }
    }, true);

    // Patch renderOrderItems to inject warehouse buttons
    function _patchRenderOrderItems() {
      const _origRender = window.renderOrderItems;
      if (!_origRender) return false;
      window.renderOrderItems = function() {
        _origRender();
        // After Galaxy renders, inject warehouse buttons into each item row
        setTimeout(function() {
          var items = window._galaxyOrderItems || [];
          var allWarehouses = window.warehouses || [];
          // For each item, find its DOM row and inject warehouse selector
          var list = document.getElementById('order-items-list');
          if (!list) return;
          var rows = list.querySelectorAll('[data-pid]');
          // Galaxy doesn't use data-pid, so we match by order
          // Fix broken onclick handlers on Galaxy's buttons (UUID hyphens break inline JS)
          list.querySelectorAll('button[onclick*="removeOrderItem"]').forEach(function(btn) {
            var pid = (btn.getAttribute('onclick').match(/removeOrderItem\(([^)]+)\)/) || [])[1];
            if (pid) { btn.removeAttribute('onclick'); btn.addEventListener('click', function() { window.removeOrderItem(pid); }); }
          });
          list.querySelectorAll('button[onclick*="changeQty"]').forEach(function(btn) {
            var m = btn.getAttribute('onclick').match(/changeQty\(([^,]+),([^)]+)\)/);
            if (m) { var pid=m[1], delta=parseInt(m[2]); btn.removeAttribute('onclick'); btn.addEventListener('click', function() { window.changeQty(pid, delta); }); }
          });

          var galaxyItems = items;
          galaxyItems.forEach(function(mirrorItem, idx) {
            // Find the unit price row in this item's DOM — look for the Edit button
            var allDivs = list.querySelectorAll('div');
            // Find div containing "Unit price" text for this item index
            var unitPriceRows = list.querySelectorAll('div[style*="border-top"]');
            var row = unitPriceRows[idx];
            if (!row) return;
            // Remove existing warehouse row if any
            var existing = row.parentNode.querySelector('._wh-selector');
            if (existing) existing.remove();
            // Use stored stocks from mirrorItem (already fetched when item was added)
            (function(stocks) {
              if (!Array.isArray(stocks) || stocks.length === 0) return;
              var whRow = document.createElement('div');
              whRow.className = '_wh-selector';
              whRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap';
              var label = document.createElement('span');
              label.style.cssText = 'font-size:11px;color:#aaa;font-weight:600';
              label.textContent = 'Warehouse';
              whRow.appendChild(label);
              stocks.forEach(function(s) {
                var wh = allWarehouses.find(function(w) { return w.id === s.warehouse_id; });
                var name = wh ? wh.name : 'Warehouse';
                var isSelected = mirrorItem.warehouse_id === s.warehouse_id;
                var btn = document.createElement('button');
                btn.style.cssText = 'padding:3px 10px;border:1.5px solid ' + (isSelected ? '#e8220e' : '#e4e4f0') + ';border-radius:7px;background:' + (isSelected ? '#e8220e' : '#f5f5fa') + ';font-size:11px;font-weight:700;cursor:pointer;color:' + (isSelected ? '#fff' : '#9090b8') + ';font-family:Plus Jakarta Sans,sans-serif';
                btn.textContent = name;
                btn.onclick = function() {
                  mirrorItem.warehouse_id = s.warehouse_id;
                  // Update button styles
                  whRow.querySelectorAll('button').forEach(function(b) {
                    b.style.borderColor = '#e4e4f0';
                    b.style.background = '#f5f5fa';
                    b.style.color = '#9090b8';
                  });
                  btn.style.borderColor = '#e8220e';
                  btn.style.background = '#e8220e';
                  btn.style.color = '#fff';
                };
                whRow.appendChild(btn);
              });
              row.parentNode.appendChild(whRow);
            })(mirrorItem.stocks || []);
          });
        }, 50);
      };
      return true;
    }

    // Try to patch renderOrderItems once available
    var _renderPatchInterval = setInterval(function() {
      if (_patchRenderOrderItems()) clearInterval(_renderPatchInterval);
    }, 300);
  }

  function boot() {
    // Patch navigate to remember last page
    const _origNav = window.navigate;
    window.navigate = function(page) {
      if (page && page !== 'login' && page !== 'dashboard') localStorage.setItem('_galaxy_last_page', page);
      if (_origNav) return _origNav(page);
    };

    patchLoginScreen();
    patchRefill();
    patchWarehouses();
    patchUsers();
    patchSettings();
    patchFinance();
    patchOrderItems();

    // If already logged in via sessionStorage (JWT still valid), load real data
    const saved = sessionStorage.getItem(window.SESSION_KEY || 'galaxy_user');

      if (saved && API.Auth.isLoggedIn()) {
  var _lastPage = localStorage.getItem('_galaxy_last_page');
  if (_lastPage) { setTimeout(function(){ if(window.navigate) window.navigate(_lastPage); }, 0); }
  document.body.style.visibility = 'visible';
  loadRealData().finally(function() {


        // After data loads, restore last page and re-render if needed
        if (_lastPage) {
          var _restoreInterval = setInterval(function() {
            var navEl = document.querySelector('.nav-item[onclick*="\'' + _lastPage + '\'"]');
            if (navEl) {
              clearInterval(_restoreInterval);
              navEl.click();
              if (_lastPage === 'manageorders') {
                setTimeout(function() {
                  if (typeof window.renderOrdersPage === 'function') window.renderOrdersPage();
                }, 400);
              }
            }
          }, 200);
          setTimeout(function() { clearInterval(_restoreInterval); }, 5000);
        }
      });
    }

    console.log('✅ Galaxy Integration Layer loaded');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    // DOM already ready (script loaded at bottom)
    setTimeout(boot, 0);
  }

  // ══════════════════════════════════════════════════
  // Fix: UUID product IDs break onclick='addOrderItem(uuid)'
  // Override searchItems to use data attributes instead
  // ══════════════════════════════════════════════════
  // Set immediately and also after delay to ensure it's always available
  function _installSearchItems() {
    window.searchItems = function() {
      const q = (document.getElementById('item-search-input')?.value || '').toLowerCase().trim();
      const res = document.getElementById('item-search-results');
      if (!q) { if(res) res.innerHTML = ''; return; }
      const found = (window.products || []).filter(p => p.on && (p.name.toLowerCase().includes(q) || (p.code||'').toLowerCase().includes(q))).slice(0, 6);
      if (!found.length) { res.innerHTML = "<div style='font-size:12px;color:#aaa;padding:8px;font-weight:600'>No products found</div>"; return; }

      // Store products in a lookup map keyed by index to avoid UUID in onclick
      window._searchResultMap = {};
      res.innerHTML = found.map((p, i) => {
        window._searchResultMap[i] = p.id;
        const qty = typeof tStk === 'function' ? tStk(p) : 0;
        const img = (p.images && p.images[0]) ? p.images[0] : (window.PLACEHOLDER || '');
        return "<div onclick='addOrderItem(window._searchResultMap[" + i + "])' style='display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid #e4e4f0;border-radius:10px;cursor:pointer;background:#fff' onmouseenter='this.style.borderColor=\"#e8220e\"' onmouseleave='this.style.borderColor=\"#e4e4f0\"'>" +
          "<div style='width:38px;height:38px;border-radius:8px;overflow:hidden;border:1px solid #e4e4f0;background:#f5f5fa;flex-shrink:0'><img src='" + img + "' style='width:100%;height:100%;object-fit:cover'></div>" +
          "<div style='flex:1'><div style='font-size:13px;font-weight:700;color:#18182b'>" + p.name + "</div><div style='font-size:11px;color:#aaa;font-weight:600'>SKU: " + (p.code||'—') + " · Stock: " + qty + "</div></div>" +
          "<div style='font-size:13px;font-weight:800;color:#e8220e'>" + (typeof L === 'function' ? L(p.price) : p.price) + "</div>" +
          "</div>";
      }).join('');
    };
  }
  _installSearchItems();
  setTimeout(_installSearchItems, 500);
  setTimeout(_installSearchItems, 1500);

})();
