import { describe, expect, it } from "vitest";
import type { MemoryItemDto } from "@relay/shared";

import { buildGraphLinks, buildGraphNodes, type EntityGraphDto, type SourceGraphDto } from "./memory-graph-utils";

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

const stripeEntity: EntityGraphDto = {
  id: "entity-1",
  name: "Stripe",
  kind: "technology",
  memoryItemIds: ["memory-source"],
};

describe("memory graph source topology", () => {
  it("connects source file nodes directly to root", () => {
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
      expect.objectContaining({ id: "__root__", hub: "root" }),
      expect.objectContaining({ id: "__source__source-1", kind: "source-file", source: expect.objectContaining({ displayName: "architecture.md" }) }),
    ]));
    expect(links).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "__root__", target: "__source__source-1" }),
      expect.objectContaining({ source: "__source__source-1", target: "memory-source", sourceLink: true }),
    ]));
  });

  it("keeps source-derived memory out of type hub fallback links", () => {
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

  it("adds entity nodes and entity-to-memory relation links", () => {
    const nodes = buildGraphNodes(
      [memoryItem("memory-source", "Stripe checkout decision")],
      new Set(),
      "Test Project",
      [source],
      [stripeEntity],
    );
    const links = buildGraphLinks(nodes, [], [], [], [
      { entityId: "entity-1", memoryItemId: "memory-source", confidence: 0.86 },
    ]);

    expect(nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "__entity__entity-1", kind: "entity", label: "Stripe" }),
    ]));
    expect(links).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: "__entity__entity-1",
        target: "memory-source",
        relationType: "mentions",
        entityLink: true,
      }),
    ]));
  });
});
