-- E2.3: Rename audit_logs → core_audit_log (Core now owns this table)
ALTER TABLE audit_logs RENAME TO core_audit_log;

-- Performance indexes (absent from original Privacy migration)
CREATE INDEX IF NOT EXISTS core_audit_log_tenant_id_idx      ON core_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS core_audit_log_tenant_created_idx ON core_audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS core_audit_log_user_id_idx        ON core_audit_log(user_id);
CREATE INDEX IF NOT EXISTS core_audit_log_module_idx         ON core_audit_log(module);
