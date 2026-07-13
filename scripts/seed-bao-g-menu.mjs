import pkg from 'pg';
const { Client } = pkg;
const client = new Client({
  host: 'aws-0-ap-southeast-1.pooler.supabase.com', port: 6543,
  user: 'postgres.gbioelofixkczadssfta', password: 'Abd.usman2002',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
await client.connect();

// 1. Mark old test items as unavailable (preserve order history references)
const { rows: oldItems } = await client.query(
  "SELECT id, name FROM menu_items WHERE name LIKE 'Bao Bun%' OR name IN ('Spring Rolls (6pc)','Fried Rice','Chow Mein','Jasmine Tea')"
);
for (const item of oldItems) {
  await client.query('UPDATE menu_items SET available = false WHERE id = $1', [item.id]);
  console.log('Marked unavailable:', item.name);
}

// 2. Insert real Bao-G BBQ menu
const items = [
  // Mutton Karahi
  { name: 'Mutton Karahi (Full)', price: 4400, category: 'Mutton Karahi' },
  { name: 'Mutton Karahi (Half)', price: 2200, category: 'Mutton Karahi' },
  { name: 'Mutton Black Pepper (Full)', price: 4400, category: 'Mutton Karahi' },
  { name: 'Mutton Black Pepper (Half)', price: 2200, category: 'Mutton Karahi' },
  { name: 'Mutton White Karahi (Full)', price: 4500, category: 'Mutton Karahi' },
  { name: 'Mutton White Karahi (Half)', price: 2300, category: 'Mutton Karahi' },
  { name: 'Mutton Achari (Full)', price: 4500, category: 'Mutton Karahi' },
  { name: 'Mutton Achari (Half)', price: 2300, category: 'Mutton Karahi' },
  { name: 'Mutton Makhani (Full)', price: 4500, category: 'Mutton Karahi' },
  { name: 'Mutton Makhani (Half)', price: 2300, category: 'Mutton Karahi' },
  { name: 'Mutton Peshawari (Full)', price: 4500, category: 'Mutton Karahi' },
  { name: 'Mutton Peshawari (Half)', price: 2300, category: 'Mutton Karahi' },

  // Chicken Karahi
  { name: 'Chicken Karahi (Full)', price: 1700, category: 'Chicken Karahi' },
  { name: 'Chicken Karahi (Half)', price: 900, category: 'Chicken Karahi' },
  { name: 'Chicken Black Pepper (Full)', price: 1800, category: 'Chicken Karahi' },
  { name: 'Chicken Black Pepper (Half)', price: 950, category: 'Chicken Karahi' },
  { name: 'Chicken Hyderabadi (Full)', price: 1800, category: 'Chicken Karahi' },
  { name: 'Chicken Hyderabadi (Half)', price: 950, category: 'Chicken Karahi' },
  { name: 'Chicken Achari (Full)', price: 1800, category: 'Chicken Karahi' },
  { name: 'Chicken Achari (Half)', price: 950, category: 'Chicken Karahi' },
  { name: 'Chicken White Karahi (Full)', price: 1800, category: 'Chicken Karahi' },
  { name: 'Chicken White Karahi (Half)', price: 1000, category: 'Chicken Karahi' },
  { name: 'Chicken Makhani (Full)', price: 1800, category: 'Chicken Karahi' },
  { name: 'Chicken Makhani (Half)', price: 1000, category: 'Chicken Karahi' },
  { name: 'Chicken Peshawari (Full)', price: 1800, category: 'Chicken Karahi' },
  { name: 'Chicken Peshawari (Half)', price: 950, category: 'Chicken Karahi' },
  { name: 'Chicken Green Chilli Lemon (Full)', price: 1800, category: 'Chicken Karahi' },
  { name: 'Chicken Green Chilli Lemon (Half)', price: 950, category: 'Chicken Karahi' },
  { name: 'Chicken Qeema Karahi (Full)', price: 2200, category: 'Chicken Karahi' },
  { name: 'Chicken Qeema Karahi (Half)', price: 1100, category: 'Chicken Karahi' },
  { name: 'Chicken Qeema (Plate)', price: 600, category: 'Chicken Karahi' },

  // Boneless Handi
  { name: 'Chicken Handi (Full)', price: 2400, category: 'Boneless Handi' },
  { name: 'Chicken Handi (Half)', price: 1200, category: 'Boneless Handi' },
  { name: 'Chicken Black Pepper Handi (Full)', price: 2400, category: 'Boneless Handi' },
  { name: 'Chicken Black Pepper Handi (Half)', price: 1200, category: 'Boneless Handi' },
  { name: 'Chicken Hyderabadi Handi (Full)', price: 2400, category: 'Boneless Handi' },
  { name: 'Chicken Hyderabadi Handi (Half)', price: 1200, category: 'Boneless Handi' },
  { name: 'Chicken White Handi (Full)', price: 2400, category: 'Boneless Handi' },
  { name: 'Chicken White Handi (Half)', price: 1200, category: 'Boneless Handi' },
  { name: 'Chicken Makhani Handi (Full)', price: 2400, category: 'Boneless Handi' },
  { name: 'Chicken Makhani Handi (Half)', price: 1200, category: 'Boneless Handi' },
  { name: 'Chicken Jalfrezi', price: 800, category: 'Boneless Handi' },
  { name: 'Chicken Ginger', price: 800, category: 'Boneless Handi' },

  // Masala
  { name: 'Chicken Piece Masala (Leg/Chest)', price: 800, category: 'Masala' },
  { name: 'Chicken Kebab Masala (Full/Plate)', price: 1560, category: 'Masala' },
  { name: 'Chicken Kebab Masala (Half)', price: 900, category: 'Masala' },
  { name: 'Beef Kebab Masala (Full/Plate)', price: 1560, category: 'Masala' },
  { name: 'Beef Kebab Masala (Half)', price: 900, category: 'Masala' },
  { name: 'Chicken Tikka Masala (Full/Plate)', price: 1800, category: 'Masala' },
  { name: 'Chicken Tikka Masala (Half)', price: 1080, category: 'Masala' },
  { name: 'Fry Charges (Full)', price: 480, category: 'Masala' },
  { name: 'Fry Charges (Half)', price: 360, category: 'Masala' },

  // BBQ Kebab
  { name: 'Beef Kebab', price: 180, category: 'BBQ Kebab' },
  { name: 'Chicken Kebab', price: 180, category: 'BBQ Kebab' },
  { name: 'Reshmi Kebab', price: 200, category: 'BBQ Kebab' },

  // Beef
  { name: 'Beef Handi (Full)', price: 2400, category: 'Beef' },
  { name: 'Beef Handi (Half)', price: 1200, category: 'Beef' },
  { name: 'Tawa Qeema Beef (Plate)', price: 600, category: 'Beef' },

  // BBQ Pieces
  { name: 'Chicken Chest Piece', price: 430, category: 'BBQ Pieces' },
  { name: 'Chicken Leg Piece', price: 400, category: 'BBQ Pieces' },
  { name: 'Chicken Malai Piece (Chest/Leg)', price: 450, category: 'BBQ Pieces' },
  { name: 'Chicken Dum Pukht Piece (Chest/Leg)', price: 450, category: 'BBQ Pieces' },

  // BBQ Boti
  { name: 'Malai Boti', price: 400, category: 'BBQ Boti' },
  { name: 'Afghani Boti', price: 400, category: 'BBQ Boti' },
  { name: 'Rajistani Boti', price: 400, category: 'BBQ Boti' },
  { name: 'Chatkhara Boti', price: 400, category: 'BBQ Boti' },
  { name: 'Kastori Boti', price: 400, category: 'BBQ Boti' },
  { name: 'Candy Boti', price: 400, category: 'BBQ Boti' },
  { name: 'Tikka Boti', price: 200, category: 'BBQ Boti' },

  // Grilled Fish
  { name: 'Grilled Fish Rahoo (Special)', price: 1600, category: 'Grilled Fish', description: 'Price per kg' },
  { name: 'Finger Fish', price: 3000, category: 'Grilled Fish', description: 'Price per kg' },

  // Tandoor
  { name: 'Roti', price: 20, category: 'Tandoor' },
  { name: 'Khamiri Roti', price: 30, category: 'Tandoor' },
  { name: 'Roghni Naan', price: 80, category: 'Tandoor' },
  { name: 'Paratha', price: 90, category: 'Tandoor' },
  { name: 'Garlic Naan', price: 150, category: 'Tandoor' },
  { name: 'Kalwanji Naan', price: 90, category: 'Tandoor' },
  { name: 'Kalwanji Paratha', price: 100, category: 'Tandoor' },
  { name: 'Chicken Naan', price: 540, category: 'Tandoor' },

  // Drinks & Beverages
  { name: 'Tin Pack', price: 130, category: 'Drinks & Beverages' },
  { name: 'Soft Drink (500 ml)', price: 130, category: 'Drinks & Beverages' },
  { name: 'Soft Drink (1 Litre)', price: 180, category: 'Drinks & Beverages' },
  { name: 'Soft Drink (1.5 Litre)', price: 230, category: 'Drinks & Beverages' },
  { name: 'Water (Large)', price: 120, category: 'Drinks & Beverages' },
  { name: 'Water (Small)', price: 60, category: 'Drinks & Beverages' },
];

for (const item of items) {
  await client.query(
    'INSERT INTO menu_items (name, description, price, category) VALUES ($1, $2, $3, $4)',
    [item.name, item.description || null, item.price, item.category]
  );
  console.log('Inserted:', item.name, 'Rs.' + item.price);
}

// 3. Update currency symbol to Rs.
await client.query("UPDATE settings SET currency_symbol = 'Rs.' WHERE id = (SELECT id FROM settings LIMIT 1)");
console.log('Currency symbol updated to Rs.');

// Verify
const { rows: allItems } = await client.query('SELECT name, price, category, available FROM menu_items ORDER BY category, name');
console.log('\nAll menu items:');
for (const i of allItems) {
  console.log(`  [${i.available ? 'X' : ' '}] Rs.${i.price}  ${i.name.padEnd(40)} ${i.category}`);
}

await client.end();
