-- Contrainte métier : la répartition des droits d'une version doit totaliser
-- exactement 100 % (cf. note dans schema.prisma — Prisma ne génère pas cela).
--
-- 1) CHECK par ligne : un pourcentage est dans ]0 ; 100].
-- 2) Trigger de contrainte DÉFÉRÉ : à la fin de la transaction, si une version
--    possède des splits, leur somme doit faire exactement 100.00. Déféré pour
--    permettre l'insertion ligne par ligne dans une même transaction.

ALTER TABLE "Split"
  ADD CONSTRAINT "Split_percentage_range"
  CHECK ("percentage" > 0 AND "percentage" <= 100);

CREATE OR REPLACE FUNCTION check_split_sum() RETURNS trigger AS $$
DECLARE
  v_version_id text;
  v_sum numeric;
BEGIN
  v_version_id := COALESCE(NEW."versionId", OLD."versionId");

  SELECT COALESCE(SUM("percentage"), 0) INTO v_sum
  FROM "Split"
  WHERE "versionId" = v_version_id;

  -- 0 split = pas encore de répartition (autorisé) ; sinon somme stricte à 100.
  IF v_sum <> 0 AND v_sum <> 100 THEN
    RAISE EXCEPTION
      'La somme des splits de la version % doit faire 100 %% (actuel : %)',
      v_version_id, v_sum;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER split_sum_must_be_100
  AFTER INSERT OR UPDATE OR DELETE ON "Split"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION check_split_sum();
