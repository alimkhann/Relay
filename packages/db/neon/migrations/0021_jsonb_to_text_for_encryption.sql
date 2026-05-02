-- Convert JSONB columns to TEXT so they can store encrypted strings.
-- The application serializes/deserializes JSON and handles encryption transparently.

-- project_state: decisions, constraints, open_tasks, relevant_tools, objective_history
ALTER TABLE project_state ALTER COLUMN decisions TYPE text USING decisions::text;
ALTER TABLE project_state ALTER COLUMN constraints TYPE text USING constraints::text;
ALTER TABLE project_state ALTER COLUMN open_tasks TYPE text USING open_tasks::text;
ALTER TABLE project_state ALTER COLUMN relevant_tools TYPE text USING relevant_tools::text;
ALTER TABLE project_state ALTER COLUMN objective_history TYPE text USING objective_history::text;

-- Update defaults from '[]'::jsonb to '[]' text
ALTER TABLE project_state ALTER COLUMN decisions SET DEFAULT '[]';
ALTER TABLE project_state ALTER COLUMN constraints SET DEFAULT '[]';
ALTER TABLE project_state ALTER COLUMN open_tasks SET DEFAULT '[]';
ALTER TABLE project_state ALTER COLUMN relevant_tools SET DEFAULT '[]';
ALTER TABLE project_state ALTER COLUMN objective_history SET DEFAULT '[]';

-- session_digests: structured_digest
ALTER TABLE session_digests ALTER COLUMN structured_digest TYPE text USING structured_digest::text;
ALTER TABLE session_digests ALTER COLUMN structured_digest SET DEFAULT '{}';
