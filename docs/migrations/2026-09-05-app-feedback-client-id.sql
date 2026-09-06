-- Idempotency key for submit_feedback (hardening sub-project A). Old rows keep NULL.
ALTER TABLE app_feedback
  ADD COLUMN client_id VARCHAR(36) NULL AFTER id,
  ADD UNIQUE KEY uq_app_feedback_client_id (client_id);
