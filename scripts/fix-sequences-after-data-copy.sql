-- Run on the SAME database your app uses (same host/db as DATABASE_URL_PROD).
--
-- After COPY / pg_restore with explicit ids, SERIAL sequences can stay near 1..N while
-- MAX(id) is large. pg_get_serial_sequence() is not always the sequence your column
-- DEFAULT actually calls (duplicate restores may leave mtgrequestbot_requests_id_seq1,
-- etc.), so we bump every public sequence whose name starts with mtgrequestbot_requests.
--
-- Verifies with NOTICE lines: each sequence’s next nextval will be MAX(id)+1.

DO $$
DECLARE
  max_id bigint;
  r record;
  n int := 0;
BEGIN
  SELECT COALESCE(MAX(id), 0) INTO max_id FROM public.mtgrequestbot_requests;

  FOR r IN
    SELECT c.oid::regclass AS seq_regclass, c.relname AS seq_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'S'
      AND n.nspname = 'public'
      AND c.relname LIKE 'mtgrequestbot_requests%'
  LOOP
    PERFORM setval(r.seq_regclass::text::regclass, max_id, true);
    n := n + 1;
    RAISE NOTICE 'Synced sequence % — next nextval → %', r.seq_name, max_id + 1;
  END LOOP;

  IF n = 0 THEN
    RAISE EXCEPTION
      'No sequences found in public matching mtgrequestbot_requests%%. Check table/schema name or run diagnostics in README.';
  END IF;
END $$;
