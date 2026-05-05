-- Job-level multi-material preference list + free-text notes.
-- materialAlternatives is a JSON-encoded array of MaterialKey strings
-- ranked by priority. Maker bids are allowed if their printer stocks
-- Job.material OR any alternative. materialNotes carries free-form
-- requirements like "prefer matte finish".
ALTER TABLE "Job" ADD COLUMN "materialAlternatives" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Job" ADD COLUMN "materialNotes" TEXT;
