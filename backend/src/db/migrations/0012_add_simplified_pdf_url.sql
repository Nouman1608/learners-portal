-- Add simplified PDF URL for teacher-facing invoices
-- This PDF hides sensitive information like percentages and student fees

ALTER TABLE invoices
ADD COLUMN simplified_pdf_url VARCHAR(500);

-- Add comment for documentation
COMMENT ON COLUMN invoices.simplified_pdf_url IS 'URL to simplified PDF for teacher viewing (hides rates and percentages)';
