-- Distinguish task supplements from personal-rule provenance.
ALTER TABLE conversation_message ADD COLUMN purpose TEXT NOT NULL DEFAULT 'supplement' CHECK(purpose IN ('goal','supplement','memory-source','output'));
UPDATE conversation_message SET purpose='goal' WHERE sender='user' AND seq=1;
CREATE TRIGGER message_purpose_immutable BEFORE UPDATE OF purpose ON conversation_message BEGIN SELECT RAISE(ABORT,'immutable message purpose'); END;
ALTER TABLE memory_entry ADD COLUMN applies_to_json TEXT NOT NULL DEFAULT '["skill","document","system"]' CHECK(json_valid(applies_to_json));
