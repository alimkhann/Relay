-- Migration: 0011_objective_history
-- Phase 5: Objective & Progress Auto-Update
-- Adds objective_history JSONB column to track previous objectives for rollback.
-- Each entry: { objective: string, replacedAt: string, replacedBy: string | null }
-- Capped at 5 entries (enforced in application code).

ALTER TABLE project_state ADD COLUMN IF NOT EXISTS objective_history jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN project_state.objective_history IS 'Last 5 previous objectives: [{objective, replacedAt, replacedBy}]';
