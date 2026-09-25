-- JP-1.0 executable schema specification. UTC ISO timestamps; UUID IDs except event seq.
PRAGMA foreign_keys=ON;
PRAGMA journal_mode=WAL;
PRAGMA synchronous=FULL;

CREATE TABLE schema_migration(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE project(
 id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
 root_path TEXT NOT NULL UNIQUE, state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','archived','deleted')),
 policy_json TEXT NOT NULL CHECK(json_valid(policy_json)), revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE provider_config(
 id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('model','search','ocr','release')),
 protocol TEXT NOT NULL, base_url TEXT NOT NULL, model_id TEXT, secret_ref TEXT,
 config_json TEXT NOT NULL CHECK(json_valid(config_json)), revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE capability_check(
 id TEXT PRIMARY KEY, provider_id TEXT NOT NULL REFERENCES provider_config(id), provider_revision INTEGER NOT NULL,
 capabilities_json TEXT NOT NULL CHECK(json_valid(capabilities_json)), status TEXT NOT NULL CHECK(status IN ('passed','partial','failed')),
 checked_at TEXT NOT NULL, evidence_hash TEXT
);
CREATE TABLE work_item(
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id), name TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('skill','document','system')), goal TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('checkpoint','explore')),
 state TEXT NOT NULL CHECK(state IN ('draft','active','paused','blocked','cancelled','delivered')),
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE workflow_run(
 id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES work_item(id), template_version TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('queued','running','waiting_input','waiting_approval','pausing','paused','reconciling','blocked','failed','cancelled','delivered')),
 config_json TEXT NOT NULL CHECK(json_valid(config_json)), revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX one_live_run ON workflow_run(work_id) WHERE state NOT IN ('failed','cancelled','delivered');
CREATE TABLE stage_run(
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES workflow_run(id), stage_key TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('not_started','active','awaiting_review','passed','provisional','rework','blocked')),
 iteration INTEGER NOT NULL DEFAULT 1 CHECK(iteration>0), revision INTEGER NOT NULL DEFAULT 1,
 UNIQUE(run_id,stage_key,iteration)
);
CREATE TABLE artifact(
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id), work_id TEXT REFERENCES work_item(id),
 kind TEXT NOT NULL, title TEXT NOT NULL, sensitivity TEXT NOT NULL CHECK(sensitivity IN ('public','internal','restricted')),
 created_at TEXT NOT NULL
);
CREATE TABLE artifact_version(
 id TEXT PRIMARY KEY, artifact_id TEXT NOT NULL REFERENCES artifact(id), version INTEGER NOT NULL CHECK(version>0),
 parent_id TEXT REFERENCES artifact_version(id), object_hash TEXT NOT NULL CHECK(length(object_hash)=64),
 mime TEXT NOT NULL, size_bytes INTEGER NOT NULL CHECK(size_bytes>=0),
 author_kind TEXT NOT NULL CHECK(author_kind IN ('user','agent','system')), author_id TEXT NOT NULL,
 metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)), created_at TEXT NOT NULL,
 UNIQUE(artifact_id,version)
);
CREATE TRIGGER version_immutable BEFORE UPDATE ON artifact_version BEGIN SELECT RAISE(ABORT,'immutable artifact version'); END;
CREATE TABLE artifact_draft(
 artifact_id TEXT PRIMARY KEY REFERENCES artifact(id), base_version_id TEXT REFERENCES artifact_version(id),
 object_hash TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
);
CREATE TABLE source_span(
 id TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES artifact_version(id),
 locator_json TEXT NOT NULL CHECK(json_valid(locator_json)), text_hash TEXT NOT NULL, parser_version TEXT NOT NULL,
 confidence REAL CHECK(confidence IS NULL OR confidence BETWEEN 0 AND 1), created_at TEXT NOT NULL
);
CREATE TABLE artifact_link(
 consumer_id TEXT NOT NULL REFERENCES artifact_version(id), producer_id TEXT NOT NULL REFERENCES artifact_version(id),
 relation TEXT NOT NULL CHECK(relation IN ('depends_on','references','implements','verifies','supersedes')),
 requirement_key TEXT NOT NULL DEFAULT '', PRIMARY KEY(consumer_id,producer_id,relation,requirement_key), CHECK(consumer_id<>producer_id)
);
CREATE TABLE baseline(
 id TEXT PRIMARY KEY, stage_id TEXT NOT NULL REFERENCES stage_run(id),
 fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),
 status TEXT NOT NULL CHECK(status IN ('draft','provisional','approved','rejected')),
 valid INTEGER NOT NULL DEFAULT 1 CHECK(valid IN (0,1)), revision INTEGER NOT NULL DEFAULT 1, sealed_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE baseline_member(
 baseline_id TEXT NOT NULL REFERENCES baseline(id), version_id TEXT NOT NULL REFERENCES artifact_version(id),
 purpose TEXT NOT NULL CHECK(purpose IN ('input','output','evidence')), PRIMARY KEY(baseline_id,version_id,purpose)
);
CREATE TRIGGER sealed_member_insert BEFORE INSERT ON baseline_member WHEN (SELECT sealed_at FROM baseline WHERE id=NEW.baseline_id) IS NOT NULL BEGIN SELECT RAISE(ABORT,'sealed baseline'); END;
CREATE TRIGGER sealed_member_update BEFORE UPDATE ON baseline_member WHEN (SELECT sealed_at FROM baseline WHERE id=OLD.baseline_id) IS NOT NULL BEGIN SELECT RAISE(ABORT,'sealed baseline'); END;
CREATE TRIGGER sealed_member_delete BEFORE DELETE ON baseline_member WHEN (SELECT sealed_at FROM baseline WHERE id=OLD.baseline_id) IS NOT NULL AND (SELECT p.state FROM baseline b JOIN stage_run s ON s.id=b.stage_id JOIN workflow_run r ON r.id=s.run_id JOIN work_item w ON w.id=r.work_id JOIN project p ON p.id=w.project_id WHERE b.id=OLD.baseline_id)<>'deleted' BEGIN SELECT RAISE(ABORT,'sealed baseline'); END;
CREATE TABLE approval(
 id TEXT PRIMARY KEY, baseline_id TEXT NOT NULL REFERENCES baseline(id), fingerprint TEXT NOT NULL,
 actor_kind TEXT NOT NULL CHECK(actor_kind IN ('user','agent','system')),
 verdict TEXT NOT NULL CHECK(verdict IN ('approve','request_changes','insufficient','assume')),
 reason TEXT NOT NULL, created_at TEXT NOT NULL,
 CHECK(verdict<>'approve' OR actor_kind='user')
);
CREATE TABLE decision(
 id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES work_item(id), question TEXT NOT NULL,
 options_json TEXT NOT NULL CHECK(json_valid(options_json)), recommendation TEXT,
 status TEXT NOT NULL CHECK(status IN ('open','assumed','decided','superseded')),
 chosen TEXT, actor_kind TEXT CHECK(actor_kind IN ('user','agent','system')),
 impact_json TEXT NOT NULL CHECK(json_valid(impact_json)), revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE task(
 id TEXT PRIMARY KEY, stage_id TEXT NOT NULL REFERENCES stage_run(id), role TEXT NOT NULL, title TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('queued','running','waiting','paused','succeeded','failed','cancelled','stale')),
 input_baseline_id TEXT REFERENCES baseline(id), input_fingerprint TEXT, spec_json TEXT NOT NULL CHECK(json_valid(spec_json)),
 attempt_count INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE task_dependency(
 task_id TEXT NOT NULL REFERENCES task(id), depends_on_id TEXT NOT NULL REFERENCES task(id),
 PRIMARY KEY(task_id,depends_on_id), CHECK(task_id<>depends_on_id)
);
CREATE TABLE run_attempt(
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES task(id), attempt_no INTEGER NOT NULL CHECK(attempt_no>0),
 state TEXT NOT NULL CHECK(state IN ('running','succeeded','failed','cancelled','uncertain')),
 lease_owner TEXT NOT NULL, lease_until TEXT NOT NULL, model_config_json TEXT NOT NULL CHECK(json_valid(model_config_json)),
 started_at TEXT NOT NULL, ended_at TEXT, error_code TEXT, UNIQUE(task_id,attempt_no)
);
CREATE UNIQUE INDEX one_running_attempt ON run_attempt(task_id) WHERE state='running';
CREATE TABLE runtime_checkpoint(
 id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES run_attempt(id), sequence INTEGER NOT NULL,
 object_hash TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(attempt_id,sequence)
);
CREATE TABLE permission_grant(
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id), work_id TEXT REFERENCES work_item(id),
 capability TEXT NOT NULL, scope_json TEXT NOT NULL CHECK(json_valid(scope_json)),
 status TEXT NOT NULL CHECK(status IN ('active','revoked','expired')), revision INTEGER NOT NULL DEFAULT 1, expires_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE tool_operation(
 id TEXT PRIMARY KEY, attempt_id TEXT REFERENCES run_attempt(id), project_id TEXT NOT NULL REFERENCES project(id),
 tool TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('intent','running','succeeded','failed','uncertain','cancelled')),
 effect_class TEXT NOT NULL CHECK(effect_class IN ('read','write','exec','external')),
 grant_id TEXT REFERENCES permission_grant(id), result_hash TEXT, external_ref TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(project_id,idempotency_key)
);
CREATE TABLE review_issue(
 id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES work_item(id), version_id TEXT REFERENCES artifact_version(id),
 kind TEXT NOT NULL CHECK(kind IN ('defect','requirement','architecture','ux','evidence','release')),
 severity TEXT NOT NULL CHECK(severity IN ('critical','major','minor','note')),
 status TEXT NOT NULL CHECK(status IN ('open','assigned','fixed','retesting','closed','accepted','reopened')),
 title TEXT NOT NULL, details_json TEXT NOT NULL CHECK(json_valid(details_json)),
 fingerprint TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
 UNIQUE(work_id,fingerprint)
);
CREATE TABLE change_request(
 id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES work_item(id), from_version_id TEXT NOT NULL REFERENCES artifact_version(id),
 to_version_id TEXT NOT NULL REFERENCES artifact_version(id), reason TEXT NOT NULL,
 impact_json TEXT NOT NULL CHECK(json_valid(impact_json)), state TEXT NOT NULL CHECK(state IN ('draft','analyzed','accepted','applied','rejected')),
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, CHECK(from_version_id<>to_version_id)
);
CREATE TABLE skill_package(id TEXT PRIMARY KEY, project_id TEXT REFERENCES project(id), name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE skill_version(
 id TEXT PRIMARY KEY, skill_id TEXT NOT NULL REFERENCES skill_package(id), version_id TEXT NOT NULL REFERENCES artifact_version(id),
 status TEXT NOT NULL CHECK(status IN ('draft','validated','enabled','retired')), revision INTEGER NOT NULL DEFAULT 1,
 manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)), UNIQUE(skill_id,version_id)
);
CREATE TABLE skill_group(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id), name TEXT NOT NULL);
CREATE TABLE skill_group_version(
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES skill_group(id), version_id TEXT NOT NULL REFERENCES artifact_version(id),
 status TEXT NOT NULL CHECK(status IN ('draft','validated','enabled','retired')), revision INTEGER NOT NULL DEFAULT 1, UNIQUE(group_id,version_id)
);
CREATE TABLE skill_group_member(
 group_version_id TEXT NOT NULL REFERENCES skill_group_version(id), node_key TEXT NOT NULL,
 skill_version_id TEXT NOT NULL REFERENCES skill_version(id), mapping_json TEXT NOT NULL CHECK(json_valid(mapping_json)),
 PRIMARY KEY(group_version_id,node_key)
);
CREATE TABLE test_case(
 id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES work_item(id), definition_version_id TEXT NOT NULL REFERENCES artifact_version(id),
 category TEXT NOT NULL CHECK(category IN ('software','effect','skill')), requirement_key TEXT NOT NULL
);
CREATE TABLE test_run(
 id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES work_item(id), task_id TEXT REFERENCES task(id),
 is_simulation INTEGER NOT NULL CHECK(is_simulation IN (0,1)),
 target_json TEXT NOT NULL CHECK(json_valid(target_json)), state TEXT NOT NULL CHECK(state IN ('queued','running','finished','failed','cancelled')),
 started_at TEXT, ended_at TEXT
);
CREATE TABLE test_result(
 id TEXT PRIMARY KEY, test_run_id TEXT NOT NULL REFERENCES test_run(id), test_case_id TEXT NOT NULL REFERENCES test_case(id),
 verdict TEXT NOT NULL CHECK(verdict IN ('pass','fail','not_run','inconclusive')),
 evidence_version_id TEXT REFERENCES artifact_version(id), metrics_json TEXT NOT NULL CHECK(json_valid(metrics_json)),
 UNIQUE(test_run_id,test_case_id), CHECK(verdict NOT IN ('pass','fail') OR evidence_version_id IS NOT NULL)
);
CREATE TABLE release_target(
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id), provider_id TEXT NOT NULL REFERENCES provider_config(id),
 environment TEXT NOT NULL, contract_json TEXT NOT NULL CHECK(json_valid(contract_json)), revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE release_candidate(
 id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES work_item(id), manifest_version_id TEXT NOT NULL REFERENCES artifact_version(id),
 baseline_id TEXT NOT NULL REFERENCES baseline(id), target_id TEXT NOT NULL REFERENCES release_target(id), target_revision INTEGER NOT NULL,
 fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64), state TEXT NOT NULL CHECK(state IN ('draft','ready','authorized','publishing','verifying','delivered','failed','rolled_back','uncertain')),
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE release_authorization(
 id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES release_candidate(id), fingerprint TEXT NOT NULL,
 actor_kind TEXT NOT NULL CHECK(actor_kind='user'), action TEXT NOT NULL CHECK(action IN ('publish','rollback')),
 expires_at TEXT NOT NULL, used_at TEXT, revoked_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE release_attempt(
 id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES release_candidate(id), authorization_id TEXT NOT NULL UNIQUE REFERENCES release_authorization(id),
 operation_id TEXT NOT NULL UNIQUE REFERENCES tool_operation(id), external_run_id TEXT,
 state TEXT NOT NULL CHECK(state IN ('intent','running','succeeded','failed','uncertain','rolled_back')),
 verification_version_id TEXT REFERENCES artifact_version(id), created_at TEXT NOT NULL
);
CREATE TABLE budget_account(
 work_id TEXT PRIMARY KEY REFERENCES work_item(id), token_limit INTEGER NOT NULL CHECK(token_limit>0),
 used_tokens INTEGER NOT NULL DEFAULT 0 CHECK(used_tokens>=0), reserved_tokens INTEGER NOT NULL DEFAULT 0 CHECK(reserved_tokens>=0),
 unknown_usage INTEGER NOT NULL DEFAULT 0 CHECK(unknown_usage IN (0,1)), revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE usage_entry(
 id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES work_item(id), attempt_id TEXT REFERENCES run_attempt(id),
 call_id TEXT NOT NULL UNIQUE, reserved INTEGER NOT NULL CHECK(reserved>=0), input_tokens INTEGER CHECK(input_tokens>=0),
 output_tokens INTEGER CHECK(output_tokens>=0), state TEXT NOT NULL CHECK(state IN ('reserved','settled','unknown','released')),
 estimated_cost_decimal TEXT, currency TEXT, price_source TEXT, created_at TEXT NOT NULL
);
CREATE TABLE domain_event(
 seq INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT REFERENCES project(id), work_id TEXT REFERENCES work_item(id),
 type TEXT NOT NULL, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), created_at TEXT NOT NULL
);
CREATE TABLE request_dedup(
 request_id TEXT PRIMARY KEY, method TEXT NOT NULL, request_hash TEXT NOT NULL,
 response_json TEXT NOT NULL CHECK(json_valid(response_json)), created_at TEXT NOT NULL
);
CREATE INDEX tasks_by_stage_state ON task(stage_id,state);
CREATE INDEX versions_by_artifact ON artifact_version(artifact_id,version);
CREATE INDEX incoming_links ON artifact_link(producer_id,relation);
CREATE INDEX events_by_project ON domain_event(project_id,seq);
CREATE INDEX issues_by_work_state ON review_issue(work_id,status);
CREATE INDEX sources_by_version ON source_span(version_id);
CREATE INDEX operations_by_state ON tool_operation(project_id,state);
