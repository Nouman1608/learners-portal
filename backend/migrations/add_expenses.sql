-- Expenses (rent, utilities, salaries, ...) entered by sudo, for income vs expenses per month.
-- Run on both databases (nomi_education and nomi_junior).
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date date NOT NULL,
  category varchar(30) NOT NULL
    CHECK (category IN ('rent', 'utilities', 'maintenance', 'supplies', 'salaries', 'subscriptions', 'marketing', 'transport', 'taxes', 'other')),
  description varchar(255),
  paid_to varchar(150),
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  currency varchar(3) NOT NULL DEFAULT 'PKR' CHECK (currency IN ('PKR', 'USD', 'GBP', 'SAR')),
  payment_method varchar(20) CHECK (payment_method IN ('cash', 'bank_transfer', 'card', 'cheque', 'other')),
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expenses_expense_date_idx ON expenses (expense_date);
