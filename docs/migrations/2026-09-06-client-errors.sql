-- Client error telemetry (hardening sub-project E). Applied 2026-09-06 with:
--   docker exec -e MYSQL_PWD=<DB_PASSWORD> hsa-mysql mysql -u hsa_user hsa < this file
-- One row per (tab session, stack hash); INSERT IGNORE from the client_errors webhook.
CREATE TABLE client_errors (
  id INT NOT NULL AUTO_INCREMENT,
  session_id CHAR(36) NOT NULL,
  stack_hash CHAR(8) NOT NULL,
  kind VARCHAR(20) NOT NULL COMMENT 'onerror/unhandledrejection/boundary/api',
  screen VARCHAR(50) NULL,
  endpoint VARCHAR(80) NULL COMMENT 'webhook path for kind=api',
  status SMALLINT NULL COMMENT 'HTTP status for kind=api',
  message VARCHAR(500) NOT NULL,
  stack TEXT NULL COMMENT 'first 2048 chars',
  user_agent VARCHAR(255) NULL,
  app_version VARCHAR(40) NULL COMMENT 'main.<hash>.js bundle hash',
  week_date_range VARCHAR(80) NULL,
  client_time DATETIME NULL,
  notified TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 when this row produced the Slack line',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_client_errors_session_hash (session_id, stack_hash),
  KEY ix_client_errors_hash (stack_hash),
  KEY ix_client_errors_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
