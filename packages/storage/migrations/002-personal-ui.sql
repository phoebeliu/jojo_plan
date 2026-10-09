-- S2.1 additive migration; schema_migration records application atomically.
CREATE TABLE memory_entry(
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('preference','project_rule','method')),
 scope TEXT NOT NULL CHECK(scope IN ('personal','project','work')),
 project_id TEXT REFERENCES project(id), work_id TEXT REFERENCES work_item(id),
 status TEXT NOT NULL CHECK(status IN ('proposed','confirmed','disabled','forgotten')),
 revision INTEGER NOT NULL DEFAULT 1, method_validated INTEGER NOT NULL DEFAULT 0 CHECK(method_validated IN (0,1)),
 expires_at TEXT, sensitivity TEXT NOT NULL CHECK(sensitivity IN ('internal','restricted')), created_at TEXT NOT NULL,
 CHECK((scope='personal' AND project_id IS NULL AND work_id IS NULL) OR (scope='project' AND project_id IS NOT NULL AND work_id IS NULL) OR (scope='work' AND project_id IS NOT NULL AND work_id IS NOT NULL)),
 CHECK(kind<>'project_rule' OR scope<>'personal')
);
CREATE TABLE memory_revision(
 memory_id TEXT NOT NULL REFERENCES memory_entry(id), revision INTEGER NOT NULL,
 statement TEXT NOT NULL, source_refs_json TEXT NOT NULL CHECK(json_valid(source_refs_json)),
 actor TEXT NOT NULL CHECK(actor IN ('user','agent','system')), created_at TEXT NOT NULL,
 PRIMARY KEY(memory_id,revision)
);
CREATE TRIGGER memory_body_immutable BEFORE UPDATE ON memory_revision
 WHEN NOT(NEW.statement='' AND NEW.source_refs_json='[]' AND (SELECT status FROM memory_entry WHERE id=OLD.memory_id)='forgotten')
 BEGIN SELECT RAISE(ABORT,'memory revision immutable except purge'); END;
CREATE TABLE memory_use(
 id TEXT PRIMARY KEY, memory_id TEXT NOT NULL REFERENCES memory_entry(id), memory_revision INTEGER NOT NULL,
 work_id TEXT NOT NULL REFERENCES work_item(id), attempt_id TEXT REFERENCES run_attempt(id),
 reason TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(memory_id,memory_revision) REFERENCES memory_revision(memory_id,revision)
);
CREATE TABLE memory_tombstone(memory_id TEXT PRIMARY KEY, forgotten_at TEXT NOT NULL);
CREATE TABLE view_intent(
 id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES work_item(id), target_fingerprint TEXT NOT NULL,
 component TEXT NOT NULL CHECK(component IN ('evidence','scope','method','sources','change','handoff')),
 reason_refs_json TEXT NOT NULL CHECK(json_valid(reason_refs_json)), memory_refs_json TEXT NOT NULL CHECK(json_valid(memory_refs_json)),
 priority INTEGER NOT NULL CHECK(priority BETWEEN 0 AND 100), expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE work_preference(
 work_id TEXT PRIMARY KEY REFERENCES work_item(id), personal_enabled INTEGER NOT NULL DEFAULT 1,
 pinned_component TEXT CHECK(pinned_component IN ('evidence','scope','method','sources','change','handoff')), revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE app_setting(key TEXT PRIMARY KEY, value_json TEXT NOT NULL CHECK(json_valid(value_json)), revision INTEGER NOT NULL DEFAULT 1);
