ALTER TABLE queue_tickets
  ADD COLUMN IF NOT EXISTS print_eligible boolean NOT NULL DEFAULT true;
