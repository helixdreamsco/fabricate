-- Multi-unit ordering for template designs.
--
-- Quantity is stored on the job but deliberately kept out of paramsJson /
-- paramsHash: N units are one byte-identical STL, so folding quantity into
-- the hash would fragment the geometry cache and re-slice the same solid.
-- Quoting multiplies the single-unit slice result instead.
ALTER TABLE "DesignJob" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
