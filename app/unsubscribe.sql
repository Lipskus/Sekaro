-- Run as the application table owner after migrations. Login role created separately.
BEGIN;
CREATE SCHEMA IF NOT EXISTS sekaro_public;
REVOKE ALL ON SCHEMA sekaro_public FROM PUBLIC;
CREATE OR REPLACE FUNCTION sekaro_public.unsubscribe(p_token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE target_lead integer; target_email text;
BEGIN
    IF length(p_token) < 20 OR length(p_token) > 64 THEN RETURN false; END IF;
    SELECT t.lead_id INTO target_lead FROM public.lead_unsubscribe_token t WHERE t.token = p_token;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT lower(btrim(l.email)) INTO target_email FROM public.lead l WHERE l.id = target_lead;
    IF NOT FOUND THEN RETURN false; END IF;
    -- Same deterministic row locking order as final outbound safety checks.
    PERFORM l.id FROM public.lead l WHERE lower(btrim(l.email)) = target_email ORDER BY l.id FOR UPDATE;
    INSERT INTO public.suppression_entry(email,reason,source,note,created_at)
      VALUES(target_email,'unsubscribe','public_unsubscribe','',timezone('UTC',now()))
      ON CONFLICT(email) DO NOTHING;
    UPDATE public.campaign_lead SET enrollment_status='unsubscribed', interest_status=NULL, sending_paused=true
      WHERE lead_id IN (SELECT l.id FROM public.lead l WHERE lower(btrim(l.email))=target_email);
    -- Preserve uncertain transport claims; never erase their audit or allow a retry.
    DELETE FROM public.queue_slot q WHERE q.campaign_lead_id IN (
      SELECT c.id FROM public.campaign_lead c JOIN public.lead l ON l.id=c.lead_id WHERE lower(btrim(l.email))=target_email
    ) AND NOT EXISTS (SELECT 1 FROM public.send_attempt a WHERE a.queue_slot_id=q.id);
    RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION sekaro_public.unsubscribe(text) FROM PUBLIC;
GRANT USAGE ON SCHEMA sekaro_public TO sekaro_unsubscribe;
GRANT EXECUTE ON FUNCTION sekaro_public.unsubscribe(text) TO sekaro_unsubscribe;
COMMIT;
