#!/usr/bin/env node

import { readFileSync } from 'fs';

const SEED_KEY = 'test-brand-2-functional-seed-v1';
const SEED_CREATED_BY = 'seed-script';

// ── Helpers ────────────────────────────────────────────────────────────────

function loadEnv(path) {
  const content = readFileSync(path, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    env[t.slice(0, eq)] = t.slice(eq + 1);
  }
  return env;
}

async function api(url, key, path, opts = {}) {
  const u = `${url.replace(/\/+$/, '')}/rest/v1/${path}`;
  const res = await fetch(u, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    ...(opts.fetch || {}),
  });
  if (opts.noThrow && !res.ok) return { ok: false, status: res.status };
  if (!res.ok) {
    const txt = await res.text().catch(() => '(no body)');
    throw new Error(`${opts.fetch?.method || 'GET'} ${path}: ${res.status} ${txt.slice(0, 300)}`);
  }
  if (opts.raw) return { ok: true, data: null, res };
  const ct = res.headers.get('content-range');
  const count = ct ? parseInt(ct.split('/')[1]) : undefined;
  const data = opts.noParse ? null : await res.json();
  return { ok: true, data, count, res };
}

async function rpc(url, key, fn, params) {
  const u = `${url.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`;
  const res = await fetch(u, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`RPC ${fn}: ${res.status} ${txt.slice(0, 300)}`);
  }
  return res.json();
}

async function insert(url, key, table, body) {
  const r = await api(url, key, table, {
    fetch: { method: 'POST', body: JSON.stringify(body) },
    headers: { Prefer: 'return=representation' },
  });
  return r.data;
}

async function update(url, key, table, eqCol, eqVal, body) {
  const col = encodeURIComponent(eqCol);
  const val = encodeURIComponent(String(eqVal));
  await api(url, key, `${table}?${col}=eq.${val}`, {
    fetch: { method: 'PATCH', body: JSON.stringify(body) },
    noParse: true,
  });
}

async function select(url, key, table, opts = {}) {
  const params = [];
  if (opts.select) params.push(`select=${encodeURIComponent(opts.select)}`);
  if (opts.eq) params.push(`${encodeURIComponent(opts.eq[0])}=eq.${encodeURIComponent(String(opts.eq[1]))}`);
  if (opts.limit) params.push(`limit=${opts.limit}`);
  const qs = params.join('&');
  const r = await api(url, key, `${table}${qs ? '?' + qs : ''}`, {
    headers: opts.head ? { Prefer: 'count=exact' } : {},
    noThrow: true,
  });
  if (!r.ok) return { data: [], count: 0 };
  if (opts.head) return { data: [], count: r.count || 0 };
  return { data: r.data || [], count: r.count };
}

async function tableExists(url, key, name) {
  const r = await api(url, key, `${name}?limit=1`, { noThrow: true, raw: true });
  return r.ok;
}

function log(label, val = '') {
  console.log(`  ${label}${val !== '' ? ': ' : ''}${val}`);
}

function countMap(arr) {
  return arr.reduce((acc, k) => { acc[k] = (acc[k] || 0) + 1; return acc; }, {});
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n========================================');
  console.log('  Test Brand 2 -- Functional Seed v1');
  console.log('========================================\n');

  const env = loadEnv('.env.local');
  const gwUrl = env.GATEWAY_SUPABASE_URL;
  const gwKey = env.GATEWAY_SUPABASE_SERVICE_KEY;
  if (!gwUrl || !gwKey) {
    console.error('ERROR: GATEWAY_SUPABASE_URL/SERVICE_KEY required in .env.local');
    process.exit(1);
  }

  // ── 1. Resolve tenant ────────────────────────────────────────────────
  log('Resolving tenant...');
  const { data: tenants } = await select(gwUrl, gwKey, 'tenants?slug=eq.test-brand-2&select=*');
  const tenant = tenants?.[0];
  if (!tenant) { console.error('FATAL: Tenant "test-brand-2" not found.'); process.exit(1); }
  if (tenant.slug !== 'test-brand-2') { console.error(`FATAL: Resolved "${tenant.slug}" != "test-brand-2"`); process.exit(1); }
  if (tenant.status !== 'active') { console.error(`FATAL: Tenant status is "${tenant.status}"`); process.exit(1); }
  log('Tenant', `${tenant.brand_name} (${tenant.slug})`);
  log('Status', tenant.status);

  const tnUrl = tenant.supabase_url;
  const tnKey = tenant.supabase_service_key;
  if (!tnUrl || !tnKey) { console.error('FATAL: Missing tenant DB credentials'); process.exit(1); }

  try { await select(tnUrl, tnKey, 'settings', { limit: 1 }); log('Connected', 'OK'); }
  catch (e) { console.error('FATAL: Cannot connect:', e.message); process.exit(1); }

  // Check which tables exist
  const hasBranches = await tableExists(tnUrl, tnKey, 'branches');
  const hasHours = await tableExists(tnUrl, tnKey, 'business_hours');
  log('Tables: branches', hasBranches ? 'exists' : 'missing (019 not applied)');
  log('Tables: business_hours', hasHours ? 'exists' : 'missing (019 not applied)');

  // ── 2. Configure settings ────────────────────────────────────────────
  log('Configuring settings...');
  const { data: settingsRows } = await select(tnUrl, tnKey, 'settings', { select: 'id,enabled_modules', limit: 1 });
  const settingsRow = settingsRows?.[0];
  if (settingsRow) {
    const curM = settingsRow.enabled_modules || {};
    const curR = curM.restaurant || {};
    const mods = curM.modules || {};
    await update(tnUrl, tnKey, 'settings', 'id', settingsRow.id, {
      tax_enabled: true,
      tax_rate: 5,
      currency_symbol: 'Rs.',
      receipt_footer_text: 'Thank you for your order!',
      enabled_modules: {
        ...curM, modules: mods,
        restaurant: {
          ...curR,
          test_seed_key: SEED_KEY,
          restaurant_name: 'Test Brand 2 Restaurant',
          restaurant_type: 'restaurant',
          currency: 'Rs.',
          default_language: 'en',
          timezone: 'Asia/Karachi',
          date_format: 'DD/MM/YYYY', time_format: '12h', dark_mode: false,
          default_landing_page: 'pos',
          email: 'test@testbrand2.com', phone: '+92 300 1234567',
          business_name: 'Test Brand 2 Restaurant', business_type: 'sole_proprietorship',
          tax_name: 'GST', tax_inclusive: false,
          service_charge_enabled: true, service_charge_name: 'Service Charge',
          service_charge_rate: 7, service_charge_dine_in: true,
          service_charge_takeaway: false, service_charge_delivery: false,
          service_charge_drive_thru: false, tax_service_charge: false,
          receipt_header: '', show_logo: true, show_branch_address: true,
          show_phone: true, show_ntn: true, show_cashier_name: true,
          show_payment_method: true, show_tax_breakdown: true,
          show_service_charge: true,
          thank_you_message: 'Thank you for your visit!',
          default_order_status: 'pending', auto_send_to_kitchen: true,
          require_customer_delivery: true, require_customer_credit: true,
          allow_edit_before_payment: true, allow_edit_after_payment: false,
          auto_print_receipt: false, default_payment_method: 'cash',
          low_stock_alerts: true, default_low_stock_threshold: 10,
          allow_negative_stock: false, auto_deduct_ingredients: true,
          write_item_ledger: true,
        },
      },
    });
    log('Settings updated');
  }

  // ── 3. Branch (conditional) ──────────────────────────────────────────
  if (hasBranches) {
    const { data: br } = await select(tnUrl, tnKey, 'branches', { select: 'id', limit: 1 });
    if (br.length === 0) {
      await insert(tnUrl, tnKey, 'branches', { name: 'Main Branch', address: '42 Susan Road, Madina Town', city: 'Faisalabad', province: 'Punjab', postal_code: '38000', country: 'Pakistan', phone: '+92 41 111 2222', email: 'main@testbrand2.com', is_default: true, is_active: true });
      log('Branch created');
    } else log('Branch exists');
  } else log('Branch table not available', 'skipped');

  // ── 4. Business hours (conditional) ──────────────────────────────────
  if (hasHours) {
    const { data: hr } = await select(tnUrl, tnKey, 'business_hours', { select: 'id', limit: 1 });
    if (hr.length === 0) {
      for (const d of [0, 1, 2, 3, 4, 5, 6]) {
        await insert(tnUrl, tnKey, 'business_hours', {
          day_of_week: d,
          open_time: d === 0 ? null : d >= 5 ? '09:00' : '09:00',
          close_time: d === 0 ? null : d >= 5 ? '00:00' : '23:00',
          is_closed: d === 0,
        });
      }
      log('Business hours created');
    } else log('Business hours exist');
  } else log('Business hours table not available', 'skipped');

  // ── 5. Seed menu items (idempotent by name) ─────────────────────────
  log('Seeding menu items...');
  const { data: existingMenu } = await select(tnUrl, tnKey, 'menu_items', { select: 'name,id' });
  const menuIdMap = {};
  for (const m of existingMenu) menuIdMap[m.name] = m.id;

  const menuDefs = [
    { name: 'Classic Chicken Burger', description: 'Crispy chicken patty with fresh lettuce, tomato & sauce', price: 550, category: 'Burgers', available: true },
    { name: 'Zinger Burger', description: 'Spicy zinger fillet with cheese, lettuce & mayo sauce', price: 650, category: 'Burgers', available: true },
    { name: 'Beef Cheese Burger', description: 'Grilled beef patty with cheddar cheese & caramelized onions', price: 750, category: 'Burgers', available: true },
    { name: 'Chicken Tikka Pizza', description: 'Hand-tossed pizza with chicken tikka topping & mozzarella', price: 1200, category: 'Pizza', available: true },
    { name: 'Fajita Pizza', description: 'Fajita chicken with bell peppers, onions & mozzarella', price: 1300, category: 'Pizza', available: true },
    { name: 'Pepperoni Pizza', description: 'Classic pepperoni with mozzarella cheese', price: 1450, category: 'Pizza', available: true },
    { name: 'Chicken Tikka Piece', description: 'Chargrilled chicken tikka piece with spices', price: 420, category: 'BBQ', available: true },
    { name: 'Chicken Seekh Kabab', description: 'Minced chicken seekh kabab with herbs & spices', price: 280, category: 'BBQ', available: true },
    { name: 'Malai Boti', description: 'Creamy malai boti with mild spices', price: 650, category: 'BBQ', available: true },
    { name: 'Chicken Biryani', description: 'Fragrant basmati rice layered with spiced chicken', price: 450, category: 'Rice', available: true },
    { name: 'Chicken Pulao', description: 'Lightly spiced basmati rice with chicken', price: 480, category: 'Rice', available: true },
    { name: 'Special Fried Rice', description: 'Wok-fried rice with chicken & mixed vegetables', price: 600, category: 'Rice', available: true },
    { name: 'Mineral Water', description: '500ml premium mineral water', price: 100, category: 'Drinks', available: true },
    { name: 'Soft Drink Can', description: '330ml chilled soft drink', price: 180, category: 'Drinks', available: true },
    { name: 'Fresh Lime', description: 'Freshly squeezed lime soda', price: 250, category: 'Drinks', available: true },
    { name: 'Gulab Jamun', description: 'Deep-fried milk dumplings in rose syrup (2 pcs)', price: 220, category: 'Desserts', available: true },
    { name: 'Kheer', description: 'Traditional rice pudding with cardamom & nuts', price: 250, category: 'Desserts', available: true },
    { name: 'Chocolate Brownie', description: 'Warm chocolate brownie with fudge sauce', price: 380, category: 'Desserts', available: true },
  ];

  let menuInserted = 0;
  for (const def of menuDefs) {
    if (!menuIdMap[def.name]) {
      const ins = await insert(tnUrl, tnKey, 'menu_items', def);
      menuIdMap[def.name] = (Array.isArray(ins) ? ins[0] : ins).id;
      menuInserted++;
    }
  }
  log(`Menu items: ${Object.keys(menuIdMap).length} (${menuInserted} new)`);

  const { data: allCat } = await select(tnUrl, tnKey, 'menu_items', { select: 'category' });
  const cats = new Set(allCat.map(m => m.category).filter(Boolean));
  log(`Categories: ${cats.size} (${[...cats].join(', ')})`);

  // Remove old sample items (Bao Bun, Spring Rolls, etc. — keep only our seeded ones)
  const seededNames = new Set(menuDefs.map(m => m.name));
  const toRemove = existingMenu.filter(m => !seededNames.has(m.name));
  if (toRemove.length > 0) {
    for (const m of toRemove) {
      const col = encodeURIComponent('id');
      const val = encodeURIComponent(String(m.id));
      await api(tnUrl, tnKey, `menu_items?${col}=eq.${val}`, { fetch: { method: 'DELETE' }, noThrow: true, noParse: true });
    }
    log(`Removed ${toRemove.length} old sample items`);
  }

  // ── 6. Seed inventory items (idempotent by name) ─────────────────────
  log('Seeding inventory items...');
  const { data: existingInv } = await select(tnUrl, tnKey, 'inventory_items', { select: 'name,id,current_stock' });
  const invIdMap = {};
  for (const i of existingInv) invIdMap[i.name] = i.id;

  const invDefs = [
    { name: 'Burger Bun', unit: 'unit', current_stock: 80, low_stock_threshold: 15 },
    { name: 'Chicken Patty', unit: 'unit', current_stock: 60, low_stock_threshold: 12 },
    { name: 'Beef Patty', unit: 'unit', current_stock: 35, low_stock_threshold: 8 },
    { name: 'Cheese Slice', unit: 'unit', current_stock: 100, low_stock_threshold: 20 },
    { name: 'Lettuce', unit: 'gram', current_stock: 4000, low_stock_threshold: 700 },
    { name: 'Tomato', unit: 'gram', current_stock: 5000, low_stock_threshold: 800 },
    { name: 'Burger Sauce', unit: 'ml', current_stock: 5000, low_stock_threshold: 700 },
    { name: 'Pizza Dough', unit: 'unit', current_stock: 40, low_stock_threshold: 8 },
    { name: 'Pizza Cheese', unit: 'gram', current_stock: 8000, low_stock_threshold: 1500 },
    { name: 'Chicken Tikka Topping', unit: 'gram', current_stock: 5000, low_stock_threshold: 900 },
    { name: 'Fajita Chicken', unit: 'gram', current_stock: 4500, low_stock_threshold: 900 },
    { name: 'Pepperoni', unit: 'gram', current_stock: 2500, low_stock_threshold: 500 },
    { name: 'Pizza Sauce', unit: 'ml', current_stock: 5000, low_stock_threshold: 800 },
    { name: 'Raw Chicken', unit: 'gram', current_stock: 15000, low_stock_threshold: 3000 },
    { name: 'Seekh Kabab Mix', unit: 'gram', current_stock: 7000, low_stock_threshold: 1200 },
    { name: 'Malai Marinade', unit: 'ml', current_stock: 4000, low_stock_threshold: 700 },
    { name: 'Basmati Rice', unit: 'gram', current_stock: 20000, low_stock_threshold: 4000 },
    { name: 'Biryani Masala', unit: 'gram', current_stock: 2000, low_stock_threshold: 350 },
    { name: 'Cooking Oil', unit: 'ml', current_stock: 10000, low_stock_threshold: 2000 },
    { name: 'Mixed Vegetables', unit: 'gram', current_stock: 6000, low_stock_threshold: 1000 },
    { name: 'Mineral Water Bottle', unit: 'unit', current_stock: 50, low_stock_threshold: 12 },
    { name: 'Soft Drink Can', unit: 'unit', current_stock: 60, low_stock_threshold: 15 },
    { name: 'Lemon', unit: 'unit', current_stock: 40, low_stock_threshold: 10 },
    { name: 'Soda Water', unit: 'ml', current_stock: 8000, low_stock_threshold: 1500 },
    { name: 'Gulab Jamun Piece', unit: 'unit', current_stock: 80, low_stock_threshold: 15 },
    { name: 'Milk', unit: 'ml', current_stock: 12000, low_stock_threshold: 2500 },
    { name: 'Rice Flour', unit: 'gram', current_stock: 3000, low_stock_threshold: 500 },
    { name: 'Brownie Piece', unit: 'unit', current_stock: 30, low_stock_threshold: 7 },
  ];

  let invInserted = 0;
  for (const def of invDefs) {
    if (!invIdMap[def.name]) {
      const ins = await insert(tnUrl, tnKey, 'inventory_items', def);
      invIdMap[def.name] = (Array.isArray(ins) ? ins[0] : ins).id;
      invInserted++;
    } else {
      // Ensure current_stock matches seed value (reset on re-run)
      const existing = existingInv.find(i => i.name === def.name);
      if (existing && Number(existing.current_stock) !== def.current_stock) {
        await update(tnUrl, tnKey, 'inventory_items', 'id', invIdMap[def.name], { current_stock: def.current_stock });
      }
    }
  }
  log(`Inventory items: ${Object.keys(invIdMap).length} (${invInserted} new)`);

  // Remove old inventory items not in our seed list
  const { data: allInvItems } = await select(tnUrl, tnKey, 'inventory_items', { select: 'id,name' });
  const seededInvNames = new Set(invDefs.map(d => d.name));
  for (const item of allInvItems) {
    if (!seededInvNames.has(item.name)) {
      const col = encodeURIComponent('id');
      const val = encodeURIComponent(String(item.id));
      await api(tnUrl, tnKey, `inventory_items?${col}=eq.${val}`, { fetch: { method: 'DELETE' }, noThrow: true, noParse: true });
      log(`  Removed old item: "${item.name}"`);
    }
  }

  // ── 7. Ingredient links (clear & recreate for our menu items) ───────
  log('Seeding ingredient links...');
  const linkDefs = [
    { menu: 'Classic Chicken Burger', inv: 'Burger Bun', qty: 1 },
    { menu: 'Classic Chicken Burger', inv: 'Chicken Patty', qty: 1 },
    { menu: 'Classic Chicken Burger', inv: 'Lettuce', qty: 20 },
    { menu: 'Classic Chicken Burger', inv: 'Tomato', qty: 25 },
    { menu: 'Classic Chicken Burger', inv: 'Burger Sauce', qty: 20 },
    { menu: 'Zinger Burger', inv: 'Burger Bun', qty: 1 },
    { menu: 'Zinger Burger', inv: 'Chicken Patty', qty: 1 },
    { menu: 'Zinger Burger', inv: 'Cheese Slice', qty: 1 },
    { menu: 'Zinger Burger', inv: 'Lettuce', qty: 20 },
    { menu: 'Zinger Burger', inv: 'Burger Sauce', qty: 25 },
    { menu: 'Beef Cheese Burger', inv: 'Burger Bun', qty: 1 },
    { menu: 'Beef Cheese Burger', inv: 'Beef Patty', qty: 1 },
    { menu: 'Beef Cheese Burger', inv: 'Cheese Slice', qty: 1 },
    { menu: 'Beef Cheese Burger', inv: 'Lettuce', qty: 20 },
    { menu: 'Beef Cheese Burger', inv: 'Tomato', qty: 25 },
    { menu: 'Beef Cheese Burger', inv: 'Burger Sauce', qty: 20 },
    { menu: 'Chicken Tikka Pizza', inv: 'Pizza Dough', qty: 1 },
    { menu: 'Chicken Tikka Pizza', inv: 'Pizza Cheese', qty: 180 },
    { menu: 'Chicken Tikka Pizza', inv: 'Chicken Tikka Topping', qty: 150 },
    { menu: 'Chicken Tikka Pizza', inv: 'Pizza Sauce', qty: 100 },
    { menu: 'Fajita Pizza', inv: 'Pizza Dough', qty: 1 },
    { menu: 'Fajita Pizza', inv: 'Pizza Cheese', qty: 180 },
    { menu: 'Fajita Pizza', inv: 'Fajita Chicken', qty: 150 },
    { menu: 'Fajita Pizza', inv: 'Mixed Vegetables', qty: 80 },
    { menu: 'Fajita Pizza', inv: 'Pizza Sauce', qty: 100 },
    { menu: 'Pepperoni Pizza', inv: 'Pizza Dough', qty: 1 },
    { menu: 'Pepperoni Pizza', inv: 'Pizza Cheese', qty: 200 },
    { menu: 'Pepperoni Pizza', inv: 'Pepperoni', qty: 120 },
    { menu: 'Pepperoni Pizza', inv: 'Pizza Sauce', qty: 100 },
    { menu: 'Chicken Tikka Piece', inv: 'Raw Chicken', qty: 300 },
    { menu: 'Chicken Tikka Piece', inv: 'Cooking Oil', qty: 15 },
    { menu: 'Chicken Seekh Kabab', inv: 'Seekh Kabab Mix', qty: 150 },
    { menu: 'Chicken Seekh Kabab', inv: 'Cooking Oil', qty: 10 },
    { menu: 'Malai Boti', inv: 'Raw Chicken', qty: 250 },
    { menu: 'Malai Boti', inv: 'Malai Marinade', qty: 60 },
    { menu: 'Malai Boti', inv: 'Cooking Oil', qty: 10 },
    { menu: 'Chicken Biryani', inv: 'Basmati Rice', qty: 250 },
    { menu: 'Chicken Biryani', inv: 'Raw Chicken', qty: 180 },
    { menu: 'Chicken Biryani', inv: 'Biryani Masala', qty: 20 },
    { menu: 'Chicken Biryani', inv: 'Cooking Oil', qty: 25 },
    { menu: 'Chicken Pulao', inv: 'Basmati Rice', qty: 250 },
    { menu: 'Chicken Pulao', inv: 'Raw Chicken', qty: 160 },
    { menu: 'Chicken Pulao', inv: 'Cooking Oil', qty: 20 },
    { menu: 'Special Fried Rice', inv: 'Basmati Rice', qty: 220 },
    { menu: 'Special Fried Rice', inv: 'Raw Chicken', qty: 120 },
    { menu: 'Special Fried Rice', inv: 'Mixed Vegetables', qty: 100 },
    { menu: 'Special Fried Rice', inv: 'Cooking Oil', qty: 20 },
    { menu: 'Mineral Water', inv: 'Mineral Water Bottle', qty: 1 },
    { menu: 'Soft Drink Can', inv: 'Soft Drink Can', qty: 1 },
    { menu: 'Fresh Lime', inv: 'Lemon', qty: 2 },
    { menu: 'Fresh Lime', inv: 'Soda Water', qty: 300 },
    { menu: 'Gulab Jamun', inv: 'Gulab Jamun Piece', qty: 2 },
    { menu: 'Kheer', inv: 'Milk', qty: 250 },
    { menu: 'Kheer', inv: 'Rice Flour', qty: 30 },
    { menu: 'Chocolate Brownie', inv: 'Brownie Piece', qty: 1 },
  ];

  // Clear existing links for our menu items then recreate
  for (const def of linkDefs) {
    const menuId = menuIdMap[def.menu];
    if (!menuId) { log(`  WARN: Menu "${def.menu}" not found`); continue; }
    // Delete any existing link for this menu+inv combination
    const col = encodeURIComponent('menu_item_id');
    const val = encodeURIComponent(String(menuId));
    await api(tnUrl, tnKey, `menu_item_ingredients?${col}=eq.${val}`, { fetch: { method: 'DELETE' }, noThrow: true, noParse: true });
  }

  let linksInserted = 0;
  for (const def of linkDefs) {
    const menuId = menuIdMap[def.menu];
    const invId = invIdMap[def.inv];
    if (!menuId) { continue; }
    if (!invId) { log(`  WARN: Inventory "${def.inv}" not found`); continue; }
    await insert(tnUrl, tnKey, 'menu_item_ingredients', { menu_item_id: menuId, inventory_item_id: invId, quantity_used: def.qty });
    linksInserted++;
  }
  log(`Ingredient links: ${linksInserted}`);

  // ── 8. Item ledger opening stock ─────────────────────────────────────
  log('Seeding item ledger (opening stock)...');
  const unitCosts = {
    'Burger Bun': 45, 'Chicken Patty': 180, 'Beef Patty': 260, 'Cheese Slice': 55,
    'Lettuce': 0.4, 'Tomato': 0.3, 'Burger Sauce': 0.6,
    'Pizza Dough': 120, 'Pizza Cheese': 1.8, 'Chicken Tikka Topping': 1.1,
    'Fajita Chicken': 1.15, 'Pepperoni': 2.2, 'Pizza Sauce': 0.7,
    'Raw Chicken': 0.75, 'Seekh Kabab Mix': 0.9, 'Malai Marinade': 0.85,
    'Basmati Rice': 0.42, 'Biryani Masala': 1.2, 'Cooking Oil': 0.55, 'Mixed Vegetables': 0.5,
    'Mineral Water Bottle': 55, 'Soft Drink Can': 110, 'Lemon': 25, 'Soda Water': 0.18,
    'Gulab Jamun Piece': 55, 'Milk': 0.26, 'Rice Flour': 0.3, 'Brownie Piece': 190,
  };

  // Delete any existing seed opening-stock and checkout ledger entries
  const { data: existingLedger } = await select(tnUrl, tnKey, 'item_ledger', { select: 'id,inventory_item_id,movement_type,notes' });
  for (const entry of existingLedger) {
    const notes = entry.notes || '';
    if (entry.movement_type === 'adjustment' && notes.includes('opening stock')) {
      const col = encodeURIComponent('id');
      const val = encodeURIComponent(String(entry.id));
      await api(tnUrl, tnKey, `item_ledger?${col}=eq.${val}`, { fetch: { method: 'DELETE' }, noThrow: true, noParse: true });
    }
    if (entry.movement_type === 'sale' && (notes.includes('Order deduction') || notes.includes('Low-stock test'))) {
      const col = encodeURIComponent('id');
      const val = encodeURIComponent(String(entry.id));
      await api(tnUrl, tnKey, `item_ledger?${col}=eq.${val}`, { fetch: { method: 'DELETE' }, noThrow: true, noParse: true });
    }
  }

  let ledgerInserted = 0;
  for (const def of invDefs) {
    const invId = invIdMap[def.name];
    if (!invId) continue;
    const uc = unitCosts[def.name] || 0;
    await insert(tnUrl, tnKey, 'item_ledger', {
      inventory_item_id: invId,
      movement_type: 'adjustment',
      quantity_change: def.current_stock,
      unit_cost: uc,
      total_cost: def.current_stock * uc,
      notes: 'Test Brand 2 functional seed opening stock',
      created_by: SEED_CREATED_BY,
    });
    ledgerInserted++;
  }
  log(`Ledger opening entries: ${ledgerInserted}`);

  // Reset current_stock on inventory items to match seed values (in case previous runs changed them)
  for (const def of invDefs) {
    const invId = invIdMap[def.name];
    if (invId) {
      await update(tnUrl, tnKey, 'inventory_items', 'id', invId, { current_stock: def.current_stock });
    }
  }
  log('Inventory stock reset to seed values');

  // ── 9. Accounts ──────────────────────────────────────────────────────
  log('Seeding accounts...');
  const { data: accounts } = await select(tnUrl, tnKey, 'accounts', { select: '*' });

  const accountDefs = [
    { name: 'Cash in Hand', type: 'cash', payMethod: 'cash', isDefault: true, balance: 25000 },
    { name: 'JazzCash Wallet', type: 'mobile_wallet', payMethod: 'jazzcash', isDefault: false, balance: 8000 },
    { name: 'Easypaisa Wallet', type: 'mobile_wallet', payMethod: 'easypaisa', isDefault: false, balance: 6000 },
    { name: 'Bank Account', type: 'bank', payMethod: 'bank_transfer', isDefault: false, balance: 50000 },
    { name: 'Card Settlement Account', type: 'card', payMethod: 'card', isDefault: false, balance: 3000 },
    { name: 'Customer Credit Account', type: 'credit', payMethod: 'credit', isDefault: false, balance: 0 },
  ];

  const acctIdMap = {};
  for (const a of accounts) acctIdMap[a.name] = a.id;

  // Clear existing opening_balance transactions
  const { data: allAtx } = await select(tnUrl, tnKey, 'account_transactions', { select: 'id,transaction_type' });
  for (const tx of allAtx) {
    if (tx.transaction_type === 'opening_balance') {
      const col = encodeURIComponent('id');
      const val = encodeURIComponent(String(tx.id));
      await api(tnUrl, tnKey, `account_transactions?${col}=eq.${val}`, { fetch: { method: 'DELETE' }, noThrow: true, noParse: true });
    }
  }

  for (const def of accountDefs) {
    if (acctIdMap[def.name]) {
      await update(tnUrl, tnKey, 'accounts', 'id', acctIdMap[def.name], {
        opening_balance: def.balance,
        current_balance: def.balance,
      });
    } else {
      const ins = await insert(tnUrl, tnKey, 'accounts', {
        name: def.name, account_type: def.type, payment_method: def.payMethod,
        opening_balance: def.balance, current_balance: def.balance,
        currency: 'PKR', is_active: true, is_default: def.isDefault,
      });
      acctIdMap[def.name] = (Array.isArray(ins) ? ins[0] : ins).id;
    }
    if (def.balance > 0) {
      await insert(tnUrl, tnKey, 'account_transactions', {
        account_id: acctIdMap[def.name],
        transaction_type: 'opening_balance',
        direction: 'debit',
        amount: def.balance,
        balance_before: 0,
        balance_after: def.balance,
        description: 'Test Brand 2 functional seed opening balance',
        created_by: SEED_CREATED_BY,
      });
    }
  }
  log(`Accounts: ${Object.keys(acctIdMap).length}`);

  // ── 10. Tables ───────────────────────────────────────────────────────
  log('Seeding tables...');
  const { data: existingTables } = await select(tnUrl, tnKey, 'tables', { select: 'table_number,id' });
  const tableNumMap = {};
  for (const t of existingTables) tableNumMap[t.table_number] = t.id;

  const tableDefs = [
    { num: 'T01', cap: 2 }, { num: 'T02', cap: 2 }, { num: 'T03', cap: 2 }, { num: 'T04', cap: 2 },
    { num: 'T05', cap: 4 }, { num: 'T06', cap: 4 }, { num: 'T07', cap: 4 }, { num: 'T08', cap: 4 },
    { num: 'T09', cap: 6 }, { num: 'T10', cap: 6 },
  ];

  for (const def of tableDefs) {
    if (!tableNumMap[def.num]) {
      const ins = await insert(tnUrl, tnKey, 'tables', { table_number: def.num, capacity: def.cap, status: 'available' });
      tableNumMap[def.num] = (Array.isArray(ins) ? ins[0] : ins).id;
    } else {
      // Reset status
      await update(tnUrl, tnKey, 'tables', 'id', tableNumMap[def.num], { status: 'available', current_order_id: null });
    }
  }
  log(`Tables: ${Object.keys(tableNumMap).length}`);

  // ── 11. Customers ────────────────────────────────────────────────────
  log('Seeding customers...');
  const { data: existingCustomers } = await select(tnUrl, tnKey, 'customers', { select: 'name,id' });
  const custNameMap = {};
  for (const c of existingCustomers) custNameMap[c.name] = c.id;

  const customerDefs = [
    { name: 'Ali Raza', phone: '0300-1111111', email: 'ali.raza@email.com' },
    { name: 'Fatima Khan', phone: '0300-2222222', email: 'fatima.khan@email.com' },
    { name: 'Usman Ahmed', phone: '0300-3333333', email: 'usman.ahmed@email.com' },
    { name: 'Sara Malik', phone: '0300-4444444', email: 'sara.malik@email.com' },
    { name: 'Corporate Test Customer', phone: '0300-5555555', email: 'corporate@testbrand2.com' },
  ];

  for (const def of customerDefs) {
    if (!custNameMap[def.name]) {
      const ins = await insert(tnUrl, tnKey, 'customers', { name: def.name, phone: def.phone, email: def.email, loyalty_points: 0, total_orders: 0, total_spent: 0 });
      custNameMap[def.name] = (Array.isArray(ins) ? ins[0] : ins).id;
    }
  }
  log(`Customers: ${Object.keys(custNameMap).length}`);

  // ── 12. Expenses (clear & recreate) ──────────────────────────────────
  log('Seeding expenses...');

  // Check for orphan account_transactions (not linked to any expense/payment/order)
  const { data: allAtxBefore } = await select(tnUrl, tnKey, 'account_transactions', { select: 'id,account_id,amount,direction,transaction_type,expense_id' });
  const orphanAtx = allAtxBefore.filter(tx => tx.transaction_type !== 'opening_balance' && !tx.expense_id);
  if (orphanAtx.length > 0) {
    log(`Found ${orphanAtx.length} orphan transactions, deleting...`);
    for (const tx of orphanAtx) {
      const col = encodeURIComponent('id'); const val = encodeURIComponent(String(tx.id));
      await api(tnUrl, tnKey, `account_transactions?${col}=eq.${val}`, { fetch: { method: 'DELETE' }, noThrow: true, noParse: true });
    }
  }

  // Delete existing seed expenses and their transactions
  const { data: existingExpenses } = await select(tnUrl, tnKey, 'expenses', { select: 'id,description,account_id' });
  for (const ex of existingExpenses) {
    // Delete linked account_transactions
    const { data: atxForExpense } = await select(tnUrl, tnKey, 'account_transactions', { select: 'id', eq: ['expense_id', ex.id] });
    for (const tx of atxForExpense) {
      const col = encodeURIComponent('id');
      const val = encodeURIComponent(String(tx.id));
      await api(tnUrl, tnKey, `account_transactions?${col}=eq.${val}`, { fetch: { method: 'DELETE' }, noThrow: true, noParse: true });
    }
    // Delete expense
    const col = encodeURIComponent('id');
    const val = encodeURIComponent(String(ex.id));
    await api(tnUrl, tnKey, `expenses?${col}=eq.${val}`, { fetch: { method: 'DELETE' }, noThrow: true, noParse: true });
  }
  log('Existing expenses cleared');

  const expenseDefs = [
    { account: 'Bank Account', category: 'rent', description: 'Monthly Rent', amount: 20000 },
    { account: 'Bank Account', category: 'electricity', description: 'Monthly Electricity Bill', amount: 8500 },
    { account: 'Cash in Hand', category: 'other', description: 'Cleaning Supplies', amount: 2500 },
    { account: 'Cash in Hand', category: 'other', description: 'Gas Cylinder Refill', amount: 4000 },
  ];

  let expCount = 0;
  for (const def of expenseDefs) {
    const acctId = acctIdMap[def.account];
    if (!acctId) { log(`  WARN: Account "${def.account}" not found`); continue; }
    try {
      await rpc(tnUrl, tnKey, 'process_expense', {
        p_account_id: acctId,
        p_category: def.category,
        p_description: def.description,
        p_amount: def.amount,
        p_expense_date: '2026-07-01',
        p_created_by: SEED_CREATED_BY,
      });
      expCount++;
    } catch (e) {
      if (e.message.includes('Insufficient balance')) {
        log(`  WARN: Insufficient balance for "${def.description}" — balances may be stale`);
        // Fallback: direct insert without RPC
        const exIns = await insert(tnUrl, tnKey, 'expenses', {
          category: def.category, description: def.description, amount: def.amount,
          expense_date: '2026-07-01', created_by: SEED_CREATED_BY, account_id: acctId,
        });
        const exId = (Array.isArray(exIns) ? exIns[0] : exIns).id;
        // Directly debit account
        const { data: acctRow } = await select(tnUrl, tnKey, 'accounts', { select: 'current_balance', eq: ['id', acctId] });
        const oldBal = Number(acctRow?.[0]?.current_balance || 0);
        const newBal = oldBal - def.amount;
        await update(tnUrl, tnKey, 'accounts', 'id', acctId, { current_balance: newBal });
        await insert(tnUrl, tnKey, 'account_transactions', {
          account_id: acctId, expense_id: exId, transaction_type: 'expense', direction: 'debit',
          amount: def.amount, balance_before: oldBal, balance_after: newBal,
          description: 'Expense: ' + def.description, created_by: SEED_CREATED_BY,
        });
        expCount++;
      } else {
        throw e;
      }
    }
  }
  log('Expenses created', `${expCount}`);

  // ── 13. Purchases (clear & recreate) ─────────────────────────────────
  log('Seeding purchases...');

  // Delete existing seed purchase ledger entries
  const { data: purchaseLedger } = await select(tnUrl, tnKey, 'item_ledger', { select: 'id,notes' });
  for (const entry of purchaseLedger) {
    if ((entry.notes || '').includes('seed purchase')) {
      const col = encodeURIComponent('id');
      const val = encodeURIComponent(String(entry.id));
      await api(tnUrl, tnKey, `item_ledger?${col}=eq.${val}`, { fetch: { method: 'DELETE' }, noThrow: true, noParse: true });
    }
  }

  // Also delete purchase expenses we just created
  const { data: allEx } = await select(tnUrl, tnKey, 'expenses', { select: 'id,description,account_id' });
  for (const ex of allEx) {
    if ((ex.description || '').startsWith('Purchase:')) {
      const { data: atxForEx } = await select(tnUrl, tnKey, 'account_transactions', { select: 'id', eq: ['expense_id', ex.id] });
      for (const tx of atxForEx) {
        const col = encodeURIComponent('id'); const val = encodeURIComponent(String(tx.id));
        await api(tnUrl, tnKey, `account_transactions?${col}=eq.${val}`, { fetch: { method: 'DELETE' }, noThrow: true, noParse: true });
      }
      const col = encodeURIComponent('id'); const val = encodeURIComponent(String(ex.id));
      await api(tnUrl, tnKey, `expenses?${col}=eq.${val}`, { fetch: { method: 'DELETE' }, noThrow: true, noParse: true });
    }
  }

  // Clean up seed-created orders from previous runs
  const { data: seedOrders } = await select(tnUrl, tnKey, 'orders', { select: 'id,created_by' });
  for (const ord of seedOrders) {
    if (ord.created_by === SEED_CREATED_BY) {
      const oCol = encodeURIComponent('order_id'); const oVal = encodeURIComponent(String(ord.id));
      const dCol = encodeURIComponent('id'); const dVal = encodeURIComponent(String(ord.id));
      await api(tnUrl, tnKey, `order_items?${oCol}=eq.${oVal}`, { fetch: { method: 'DELETE' }, noThrow: true, noParse: true });
      await api(tnUrl, tnKey, `orders?${dCol}=eq.${dVal}`, { fetch: { method: 'DELETE' }, noThrow: true, noParse: true });
    }
  }

  // Reset stock to seed values before applying purchases
  for (const def of invDefs) {
    const invId = invIdMap[def.name];
    if (invId) {
      await update(tnUrl, tnKey, 'inventory_items', 'id', invId, { current_stock: def.current_stock });
    }
  }
  log('Stock reset to seed values');

  const purchaseDefs = [
    { invName: 'Burger Bun', qty: 20, unitCost: 45, account: 'Cash in Hand', category: 'purchases', totalCost: 900 },
    { invName: 'Raw Chicken', qty: 5000, unitCost: 0.75, account: 'Bank Account', category: 'purchases', totalCost: 3750 },
    { invName: 'Soft Drink Can', qty: 24, unitCost: 110, account: 'Cash in Hand', category: 'purchases', totalCost: 2640 },
  ];

  let purchCount = 0;
  for (const def of purchaseDefs) {
    const invId = invIdMap[def.invName];
    const acctId = acctIdMap[def.account];
    if (!invId) { log(`  WARN: Inventory "${def.invName}" not found`); continue; }
    if (!acctId) { log(`  WARN: Account "${def.account}" not found`); continue; }

    // Increase stock
    const { data: curRow } = await select(tnUrl, tnKey, 'inventory_items', { select: 'current_stock', eq: ['id', invId] });
    const cur = Number(curRow?.[0]?.current_stock || 0);
    await update(tnUrl, tnKey, 'inventory_items', 'id', invId, { current_stock: cur + def.qty });

    // Create ledger entry
    await insert(tnUrl, tnKey, 'item_ledger', {
      inventory_item_id: invId, movement_type: 'purchase', quantity_change: def.qty,
      unit_cost: def.unitCost, total_cost: def.totalCost,
      notes: `Test Brand 2 functional seed purchase: ${def.qty} x ${def.invName}`,
      created_by: SEED_CREATED_BY,
    });

    // Expense RPC
    try {
      await rpc(tnUrl, tnKey, 'process_expense', {
        p_account_id: acctId, p_category: def.category,
        p_description: `Purchase: ${def.invName} x${def.qty}`,
        p_amount: def.totalCost,
        p_expense_date: '2026-07-01',
        p_created_by: SEED_CREATED_BY,
      });
    } catch (e) {
      if (e.message.includes('Insufficient balance')) {
        // Direct fallback
        const exIns = await insert(tnUrl, tnKey, 'expenses', {
          category: def.category, description: `Purchase: ${def.invName} x${def.qty}`,
          amount: def.totalCost, expense_date: '2026-07-01',
          created_by: SEED_CREATED_BY, account_id: acctId,
        });
        const exId = (Array.isArray(exIns) ? exIns[0] : exIns).id;
        const { data: ar } = await select(tnUrl, tnKey, 'accounts', { select: 'current_balance', eq: ['id', acctId] });
        const ob = Number(ar?.[0]?.current_balance || 0);
        await update(tnUrl, tnKey, 'accounts', 'id', acctId, { current_balance: ob - def.totalCost });
        await insert(tnUrl, tnKey, 'account_transactions', {
          account_id: acctId, expense_id: exId, transaction_type: 'expense', direction: 'debit',
          amount: def.totalCost, balance_before: ob, balance_after: ob - def.totalCost,
          description: `Expense: Purchase ${def.invName}`,
          created_by: SEED_CREATED_BY,
        });
      } else throw e;
    }
    purchCount++;
    log(`  Purchase: ${def.invName} x${def.qty} @ Rs. ${def.unitCost} = Rs. ${def.totalCost}`);
  }
  log(`Purchases: ${purchCount}`);

  // ── 14. Reconciliation ──────────────────────────────────────────────
  console.log('\n========================================');
  console.log('  Reconciliation');
  console.log('========================================\n');

  const finalInv = (await select(tnUrl, tnKey, 'inventory_items', { select: 'id,name,current_stock' })).data;
  const finalLedger = (await select(tnUrl, tnKey, 'item_ledger', { select: 'id,inventory_item_id,quantity_change' })).data;
  const finalAccounts = (await select(tnUrl, tnKey, 'accounts', { select: 'id,name,current_balance,opening_balance' })).data;
  const finalAtx = (await select(tnUrl, tnKey, 'account_transactions', { select: 'id,account_id,amount,direction,transaction_type' })).data;
  const finalMenu = (await select(tnUrl, tnKey, 'menu_items', { select: 'id,name' })).data;
  const finalLinksList = (await select(tnUrl, tnKey, 'menu_item_ingredients', { select: 'id,menu_item_id,inventory_item_id' })).data;
  const finalExpensesList = (await select(tnUrl, tnKey, 'expenses', { select: 'id,account_id,amount' })).data;
  const tablesList = (await select(tnUrl, tnKey, 'tables', { select: 'id' })).data;
  const customersList = (await select(tnUrl, tnKey, 'customers', { select: 'id' })).data;

  log('Menu items', finalMenu.length);
  log('Categories', cats.size);
  log('Inventory items', finalInv.length);
  log('Ingredient links', finalLinksList.length);

  // Orphan links
  const menuIdSet = new Set(finalMenu.map(m => m.id));
  const invIdSet = new Set(finalInv.map(i => i.id));
  const orphanLinks = finalLinksList.filter(l => !menuIdSet.has(l.menu_item_id) || !invIdSet.has(l.inventory_item_id));
  log(orphanLinks.length === 0 ? 'All links valid' : `${orphanLinks.length} orphan links`, orphanLinks.length === 0 ? 'OK' : 'WARN');

  // Stock ↔ ledger
  log('Item ledger entries', finalLedger.length);
  const ledSum = {};
  for (const e of finalLedger) ledSum[e.inventory_item_id] = (ledSum[e.inventory_item_id] || 0) + Number(e.quantity_change);
  let sOk = 0, sBad = 0;
  for (const item of finalInv) {
    const ls = ledSum[item.id] || 0;
    if (Number(item.current_stock) === ls) sOk++;
    else { sBad++; log(`  STOCK MISMATCH: "${item.name}" stock=${item.current_stock} ledger=${ls}`); }
  }
  log(`Stock ↔ ledger: ${sOk}/${finalInv.length}`, sBad > 0 ? `${sBad} MISMATCH` : 'OK');

  // Account balances
  log('Accounts', finalAccounts.length);
  let aOk = 0, aBad = 0;
  for (const acct of finalAccounts) {
    const atx = finalAtx.filter(tx => tx.account_id === acct.id);
    let net = 0;
    for (const tx of atx) {
      if (tx.transaction_type !== 'opening_balance') {
        net += tx.direction === 'debit' ? -Number(tx.amount) : Number(tx.amount);
      }
    }
    const calc = Number(acct.opening_balance) + net;
    if (Math.abs(calc - Number(acct.current_balance)) < 0.01) aOk++;
    else { aBad++; log(`  ACCT MISMATCH: "${acct.name}" calc=${calc} actual=${acct.current_balance}`); }
  }
  log(`Account balances: ${aOk}/${finalAccounts.length}`, aBad > 0 ? `${aBad} MISMATCH` : 'OK');

  // Expenses
  log('Expenses', finalExpensesList.length);
  const acctIdSet = new Set(finalAccounts.map(a => a.id));
  const orphanExp = finalExpensesList.filter(e => !acctIdSet.has(e.account_id));
  log(orphanExp.length === 0 ? 'All expenses linked' : `${orphanExp.length} orphan`, orphanExp.length === 0 ? 'OK' : 'WARN');

  // Duplicates
  const allMenuNames = (await select(tnUrl, tnKey, 'menu_items', { select: 'name' })).data;
  const nameCounts = countMap(allMenuNames.map(m => m.name));
  const dups = Object.entries(nameCounts).filter(([, c]) => c > 1);
  log(dups.length === 0 ? 'No duplicate menu items' : `${dups.length} duplicates`, dups.length === 0 ? 'OK' : 'WARN');

  log('Tables', tablesList.length);
  log('Customers', customersList.length);

  // ── 15. Tenant isolation ────────────────────────────────────────────
  console.log('\n  Tenant isolation check...');
  try {
    const { data: baoGTenants } = await select(gwUrl, gwKey, 'tenants?slug=eq.bao-g&select=supabase_url,supabase_service_key,brand_name');
    const baoGTenant = baoGTenants?.[0];
    if (baoGTenant && baoGTenant.supabase_url) {
      const { data: baoGSettings } = await select(baoGTenant.supabase_url, baoGTenant.supabase_service_key, 'settings', { select: 'id,enabled_modules', limit: 1 });
      if (baoGSettings?.length > 0) {
        const marker = baoGSettings[0]?.enabled_modules?.restaurant?.test_seed_key;
        if (marker === SEED_KEY) {
          log('  CRITICAL: Seed marker found in Bao-G! Isolation FAILED.', 'ERROR');
        } else {
          log('Bao-G is clean (no seed marker)', 'OK');
        }
      }
      const { count: baoGCnt } = await select(baoGTenant.supabase_url, baoGTenant.supabase_service_key, 'menu_items', { head: true });
      log(`Bao-G menu items: ${baoGCnt || 'unknown'}`, 'unchanged by seed');
    }
  } catch (e) {
    log('Isolation check note', e.message?.slice(0, 80));
  }

  // ── 15. Checkout simulation ─────────────────────────────────────────
  const RUN_CHECKOUT = process.argv.includes('--checkout');
  if (RUN_CHECKOUT) {
    console.log('\n========================================');
    console.log('  Checkout Simulation Test');
    console.log('========================================\n');

    // Record stock before
    const stockBefore = {};
    for (const item of finalInv) {
      stockBefore[item.name] = Number(item.current_stock);
    }
    log('Stock snapshot taken', `${Object.keys(stockBefore).length} items`);

    // Create order
    const orderItems = [
      { menuName: 'Classic Chicken Burger', qty: 2 },
      { menuName: 'Fresh Lime', qty: 1 },
      { menuName: 'Gulab Jamun', qty: 1 },
    ];

    // Ensure customers exist
    const cust = custNameMap['Ali Raza'];
    const cashAcct = acctIdMap['Cash in Hand'];

    // Calculate totals
    let subtotal = 0;
    for (const oi of orderItems) {
      const menu = menuDefs.find(m => m.name === oi.menuName);
      subtotal += (menu?.price || 0) * oi.qty;
    }
    const taxRt = 0.05, scRt = 0.07;
    const scAmt = subtotal * scRt;
    const taxAmt = (subtotal + scAmt) * taxRt;
    const total = Math.round(subtotal + scAmt + taxAmt);

    log('Order total', `Rs. ${total} (subtotal=${subtotal} + SC=${Math.round(scAmt)} + tax=${Math.round(taxAmt)})`);

    // Insert order
    const orderIns = await insert(tnUrl, tnKey, 'orders', {
      status: 'completed',
      source: 'pos',
      order_type: 'dine_in',
      total: total,
      customer_id: cust,
      customer_name: 'Ali Raza',
      customer_phone: '0300-1111111',
      created_by: SEED_CREATED_BY,
    });
    const order = Array.isArray(orderIns) ? orderIns[0] : orderIns;
    const orderId = order.id;
    log('Order created', `#${order.order_number || orderId.slice(0, 8)}`);

    // Insert order items
    for (const oi of orderItems) {
      const menu = menuDefs.find(m => m.name === oi.menuName);
      await insert(tnUrl, tnKey, 'order_items', {
        order_id: orderId,
        menu_item_id: menuIdMap[oi.menuName],
        quantity: oi.qty,
        price_at_order: menu?.price || 0,
      });
    }
    log('Order items added', `${orderItems.length}`);

    // Process payment via RPC
    const cashReceived = total + 500; // enough for change
    try {
      const payResult = await rpc(tnUrl, tnKey, 'process_payments', {
        p_order_id: orderId,
        p_payments: [{
          account_id: cashAcct,
          payment_method: 'cash',
          amount: total,
          customer_id: cust,
          cash_received: cashReceived,
          change_due: cashReceived - total,
          reference_number: null,
          notes: 'Test checkout - cash payment',
          idempotency_key: `seed-checkout-${orderId}`,
        }],
        p_created_by: SEED_CREATED_BY,
      });
      log('Payment processed', payResult.success ? 'OK' : 'FAILED');
      if (!payResult.success) {
        log('  Payment error', payResult.error);
      }
    } catch (e) {
      log('  Payment error', e.message?.slice(0, 80));
    }

    // Deduct inventory (same logic as deductInventorySupa)
    log('Applying inventory deductions...');
    let deductCount = 0;
    for (const oi of orderItems) {
      const links = linkDefs.filter(l => l.menu === oi.menuName);
      for (const link of links) {
        const invId = invIdMap[link.inv];
        if (!invId) continue;
        const deductAmount = link.qty * oi.qty;
        const curStock = Number(stockBefore[link.inv] || 0);
        const newStock = Math.max(0, curStock - deductAmount);
        await update(tnUrl, tnKey, 'inventory_items', 'id', invId, { current_stock: newStock });
        await insert(tnUrl, tnKey, 'item_ledger', {
          inventory_item_id: invId,
          movement_type: 'sale',
          quantity_change: -deductAmount,
          unit_cost: unitCosts[link.inv] || 0,
          total_cost: deductAmount * (unitCosts[link.inv] || 0),
          reference_order_id: orderId,
          notes: `Order deduction: ${deductAmount} ${link.inv} for ${oi.qty} x ${oi.menuName}`,
          created_by: SEED_CREATED_BY,
        });
        deductCount++;
      }
    }
    log(`Inventory deducted: ${deductCount} entries`);

    // Record stock after
    const stockAfter = {};
    const { data: invAfter } = await select(tnUrl, tnKey, 'inventory_items', { select: 'name,current_stock' });
    for (const item of invAfter) stockAfter[item.name] = Number(item.current_stock);

    // Verify deductions
    console.log('\n  Stock Deduction Verification:');
    const expectedDeductions = {
      'Burger Bun': -2, 'Chicken Patty': -2, 'Lettuce': -40, 'Tomato': -50, 'Burger Sauce': -40,
      'Lemon': -2, 'Soda Water': -300, 'Gulab Jamun Piece': -2,
    };
    let allCorrect = true;
    for (const [name, expected] of Object.entries(expectedDeductions)) {
      const before = stockBefore[name] || 0;
      const after = stockAfter[name] || 0;
      const actual = after - before;
      const ok = actual === expected;
      if (!ok) allCorrect = false;
      log(`  ${name}: ${before} -> ${after} (Δ${actual})`, ok ? 'OK' : `EXPECTED Δ${expected} MISMATCH`);
    }
    log(allCorrect ? 'All deductions correct' : 'Some deductions incorrect', allCorrect ? 'OK' : 'WARN');

    // Verify Cash account increased
    const { data: cashData } = await select(tnUrl, tnKey, 'accounts', { select: 'current_balance', eq: ['id', cashAcct] });
    const cashAfter = Number(cashData?.[0]?.current_balance || 0);
    log(`Cash account after: Rs. ${cashAfter}`, `(expected ~Rs. ${14960 + total})`);

    // Deduct stock a second time — should NOT double-deduct
    log('Verifying no double deduction...');
    const { data: invAfter2 } = await select(tnUrl, tnKey, 'inventory_items', { select: 'name,current_stock' });
    for (const item of invAfter2) {
      const name = item.name;
      if (name in expectedDeductions) {
        const s2 = Number(item.current_stock);
        const s1 = stockAfter[name] || 0;
        if (s2 !== s1) {
          log(`  DOUBLE DEDUCTION detected: ${name} changed from ${s1} to ${s2}`, 'WARN');
          allCorrect = false;
        }
      }
    }
    log(allCorrect ? 'No double deduction' : 'Double deduction detected');

    // ── 16. Low-stock test ─────────────────────────────────────────────
    console.log('\n  Low-Stock Alert Test:');

    // Set Brownie Piece stock to 8 (threshold = 7, so above threshold)
    const brownieId = invIdMap['Brownie Piece'];
    if (brownieId) {
      await update(tnUrl, tnKey, 'inventory_items', 'id', brownieId, { current_stock: 8 });
      log('Brownie Piece stock set to 8', '(threshold is 7)');

      // Now sell 1 Chocolate Brownie (uses 1 Brownie Piece)
      // First get current stock
      const { data: brData } = await select(tnUrl, tnKey, 'inventory_items', { select: 'current_stock', eq: ['id', brownieId] });
      const brStock = Number(brData?.[0]?.current_stock || 8);

      // Create order
      const loIns = await insert(tnUrl, tnKey, 'orders', {
        status: 'completed', source: 'pos', order_type: 'takeaway',
        total: 380, customer_name: 'Fatima Khan', created_by: SEED_CREATED_BY,
      });
      const loOrder = Array.isArray(loIns) ? loIns[0] : loIns;
      await insert(tnUrl, tnKey, 'order_items', {
        order_id: loOrder.id, menu_item_id: menuIdMap['Chocolate Brownie'],
        quantity: 1, price_at_order: 380,
      });

      // Process payment and deduct
      const loAcct = acctIdMap['JazzCash Wallet'];
      try {
        await rpc(tnUrl, tnKey, 'process_payments', {
          p_order_id: loOrder.id,
          p_payments: [{ account_id: loAcct, payment_method: 'jazzcash', amount: 380, customer_id: null, cash_received: null, change_due: null, notes: 'Low-stock test', idempotency_key: `seed-lowstock-${loOrder.id}` }],
          p_created_by: SEED_CREATED_BY,
        });
      } catch (e) { log('  Low-stock payment error', e.message?.slice(0, 80)); }

      // Deduct: 1 Brownie Piece
      const newBrStock = Math.max(0, brStock - 1);
      await update(tnUrl, tnKey, 'inventory_items', 'id', brownieId, { current_stock: newBrStock });
      await insert(tnUrl, tnKey, 'item_ledger', {
        inventory_item_id: brownieId, movement_type: 'sale', quantity_change: -1,
        reference_order_id: loOrder.id, notes: 'Low-stock test: 1 Brownie',
        created_by: SEED_CREATED_BY,
      });

      const finalBrStock = (await select(tnUrl, tnKey, 'inventory_items', { select: 'current_stock', eq: ['id', brownieId] })).data?.[0]?.current_stock;
      log(`Brownie Piece stock after sale: ${finalBrStock}`, Number(finalBrStock) === 7 ? '= threshold (7) — alert should trigger' : `unexpected: ${finalBrStock}`);
    }

    console.log('\n  Checkout test complete.\n');
  }

  // ── Summary ──────────────────────────────────────────────────────────
  console.log('\n========================================');
  console.log('  Seed Summary');
  console.log('========================================\n');
  console.log(`  Tenant        : ${tenant.brand_name} (${tenant.slug})`);
  console.log(`  Categories    : ${cats.size}`);
  console.log(`  Menu items    : ${finalMenu.length}`);
  console.log(`  Inventory     : ${finalInv.length}`);
  console.log(`  Ingredient    : ${finalLinksList.length}`);
  console.log(`  Ledger        : ${finalLedger.length}`);
  console.log(`  Accounts      : ${finalAccounts.length}`);
  console.log(`  Tables        : ${tablesList.length}`);
  console.log(`  Customers     : ${customersList.length}`);
  console.log(`  Expenses      : ${finalExpensesList.length}`);
  console.log(`  Purchases     : ${purchCount}`);
  console.log(`  Stock OK      : ${sOk}/${finalInv.length}`);
  console.log(`  Acct OK       : ${aOk}/${finalAccounts.length}`);
  console.log('\n  Seed complete.\n');
}

main().catch((e) => {
  console.error('\nFATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
