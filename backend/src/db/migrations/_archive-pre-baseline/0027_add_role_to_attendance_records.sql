ALTER TABLE attendance_records
  ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'student';
