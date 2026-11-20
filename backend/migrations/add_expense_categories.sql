-- Adds permanent expense categories: electricity, water, gas, printer, stationery,
-- groceries, repairs, mobile_charges. Old categories stay so existing rows remain valid.
-- Run on both databases (nomi_education and nomi_junior). Safe to re-run.
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_category_check CHECK (category IN (
  'rent', 'electricity', 'water', 'gas', 'printer', 'stationery', 'groceries', 'repairs', 'mobile_charges',
  'utilities', 'maintenance', 'supplies', 'salaries', 'subscriptions', 'marketing', 'transport', 'taxes', 'other'));
