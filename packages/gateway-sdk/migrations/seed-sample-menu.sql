-- Sample menu items — run after pos-schema.sql for testing
-- Replace with real menu data per tenant at onboarding.

INSERT INTO menu_items (name, description, price, category) VALUES
  ('Bao Bun (Pork)',    'Steamed bao bun filled with BBQ pork',      4.50, 'Bao'),
  ('Bao Bun (Chicken)', 'Steamed bao bun with teriyaki chicken',     4.50, 'Bao'),
  ('Spring Rolls (6pc)','Crispy spring rolls with sweet chili dip',  5.00, 'Starters'),
  ('Fried Rice',        'Egg fried rice with vegetables',            6.50, 'Mains'),
  ('Chow Mein',         'Stir-fried egg noodles with vegetables',    7.00, 'Mains'),
  ('Jasmine Tea',       'Hot jasmine green tea',                     2.00, 'Drinks');
