ALTER TABLE "TaxonomyNode"
ALTER COLUMN "code" SET DATA TYPE TEXT USING "code"::text,
ALTER COLUMN "parentCode" SET DATA TYPE TEXT USING "parentCode"::text;

