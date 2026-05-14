import { describe, expect, it } from "vitest";
import type { MemoryItemDto } from "@relay/shared";

import { buildGraphLinks, buildGraphNodes, type SourceGraphDto } from "./memory-graph-utils";

function memoryItem(id: string, content: string): MemoryItemDto {
  return {
    id,
    type: "decision",
    title: content,
    content,
    pinned: false,
    updatedAt: "2026-05-10T00:00:00.000Z",
    sourceSurface: null,
    sourceUrl: null,
    capturedAt: "2026-05-10T00:00:00.000Z",
    decayScore: 0.8,
    lastReaffirmedAt: null,
  };
}

const source: SourceGraphDto = {
  id: "source-1",
  kind: "uploaded_file",
  status: "ready",
  displayName: "architecture.md",
  originalFileName: "architecture.md",
  mimeType: "text/markdown",
  byteSize: 1800,
  updatedAt: "2026-05-10T00:00:00.000Z",
  sourceUri: null,
  chunkCount: 2,
  tokenEstimate: 420,
  previewText: "Relay stores source documents encrypted in R2.",
};

describe("memory graph source topology", () => {
  it("adds a separate Sources branch with file preview nodes", () => {
    const nodes = buildGraphNodes(
      [memoryItem("memory-manual", "Manual decision"), memoryItem("memory-source", "Source decision")],
      new Set(),
      "Test Project",
      [source],
    );
    const links = buildGraphLinks(nodes, [], [], [
      { sourceId: "source-1", memoryItemId: "memory-source", confidence: 0.93 },
    ]);

    expect(nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "__branch__sources", hub: "sources-branch" }),
      expect.objectContaining({ id: "__source__source-1", kind: "source-file", source: expect.objectContaining({ displayName: "architecture.md" }) }),
    ]));
    expect(links).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "__root__", target: "__branch__sources" }),
      expect.objectContaining({ source: "__branch__sources", target: "__source__source-1" }),
      expect.objectContaining({ source: "__source__source-1", target: "memory-source", sourceLink: true }),
    ]));
  });

  it("keeps source-derived memory out of Relay type hub fallback links", () => {
    const nodes = buildGraphNodes(
      [memoryItem("memory-manual", "Manual decision"), memoryItem("memory-source", "Source decision")],
      new Set(),
      "Test Project",
      [source],
    );
    const links = buildGraphLinks(nodes, [], [], [
      { sourceId: "source-1", memoryItemId: "memory-source", confidence: 0.93 },
    ]);

    expect(links).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: "memory-manual", hubLink: "hub-to-item" }),
    ]));
    expect(links).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ target: "memory-source", hubLink: "hub-to-item" }),
    ]));
  });
});
