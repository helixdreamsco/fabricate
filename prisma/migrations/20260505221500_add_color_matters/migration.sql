-- Add Job.colorMatters: when false (default), the creator doesn't care
-- about colour and any colour the maker stocks is fine. When true, the
-- existing partColors spec is the colour they want.
ALTER TABLE "Job" ADD COLUMN "colorMatters" BOOLEAN NOT NULL DEFAULT false;
