import { describe, expect, it } from "vitest";

import { toProjectStateOverrideRow, toProjectStateRow } from "./relay-v2-mapper";

describe("relay-v2-mapper", () => {
  it("normalizes malformed project-state arrays to trimmed strings", () => {
    const row = toProjectStateRow({
      project_id: "project-1",
      project_overview: null,
      current_objective: null,
      stack_domain: null,
      recent_progress: null,
      decisions: [null, "", " valid ", 7, { bad: true }],
      constraints: [" keep ", "   "],
      open_tasks: [" task "],
      relevant_tools: [undefined, " codex "],
      last_bootstrap_at: null,
      dirty: false,
      created_at: "2026-03-14T00:00:00.000Z",
      updated_at: "2026-03-14T00:00:00.000Z",
    });

    expect(row.decisions).toEqual(["valid"]);
    expect(row.constraints).toEqual(["keep"]);
    expect(row.openTasks).toEqual(["task"]);
    expect(row.relevantTools).toEqual(["codex"]);
    expect(row.decisions.every((item) => item === item.trim())).toBe(true);
  });

  it("normalizes malformed override arrays to trimmed strings", () => {
    const row = toProjectStateOverrideRow({
      project_id: "project-1",
      project_overview_override: null,
      current_objective_override: null,
      recent_progress_override: null,
      hidden_decisions: [null, "", " hidden choice ", 3],
      hidden_constraints: [" constraint "],
      hidden_open_tasks: [{ nope: true }, " task "],
      created_at: "2026-03-14T00:00:00.000Z",
      updated_at: "2026-03-14T00:00:00.000Z",
    });

    expect(row.hiddenDecisions).toEqual(["hidden choice"]);
    expect(row.hiddenConstraints).toEqual(["constraint"]);
    expect(row.hiddenOpenTasks).toEqual(["task"]);
    expect(row.hiddenOpenTasks.every((item) => item === item.trim())).toBe(true);
  });
});
