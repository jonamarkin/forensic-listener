DROP INDEX IF EXISTS idx_flag_triage_case_id;
DROP INDEX IF EXISTS idx_flag_triage_status_updated;
DROP TABLE IF EXISTS flag_triage;

DROP INDEX IF EXISTS idx_case_addresses_address;
DROP INDEX IF EXISTS idx_case_addresses_case;
DROP TABLE IF EXISTS case_addresses;

DROP INDEX IF EXISTS idx_investigation_cases_status_updated;
DROP TABLE IF EXISTS investigation_cases;
