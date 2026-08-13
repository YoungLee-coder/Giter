import { describe, expect, it } from "vitest";
import {
  commitGraphEdges,
  layoutCommitGraph,
  nodeLinkPath,
} from "../src/lib/commitGraph";

describe("layoutCommitGraph", () => {
  it("keeps a linear history in one column", () => {
    const rows = layoutCommitGraph([
      { hash: "c", parents: ["b"] },
      { hash: "b", parents: ["a"] },
      { hash: "a", parents: [] },
    ]);

    expect(rows.map((row) => row.column)).toEqual([0, 0, 0]);
    expect(rows.every((row) => row.laneCount === 1)).toBe(true);
    expect(rows[0].lines).toEqual([{ from: 0, to: 0, colorIndex: 0, fromMid: true }]);
  });

  it("opens a second lane for an unmerged branch", () => {
    const rows = layoutCommitGraph([
      { hash: "main2", parents: ["base"] },
      { hash: "feat", parents: ["base"] },
      { hash: "base", parents: [] },
    ]);

    expect(rows[0].column).toBe(0);
    expect(rows[1].column).toBe(1);
    expect(rows[2].column).toBe(0);
    expect(rows[1].lines).toEqual(
      expect.arrayContaining([
        { from: 0, to: 0, colorIndex: 0 },
        { from: 1, to: 1, colorIndex: 1, fromMid: true },
      ]),
    );
    expect(rows[2].lines).toEqual(
      expect.arrayContaining([
        { from: 0, to: 0, colorIndex: 0, toMid: true },
        { from: 1, to: 0, colorIndex: 1, toMid: true },
      ]),
    );
  });

  it("draws a merge diamond with first-parent on the left", () => {
    const rows = layoutCommitGraph([
      { hash: "M", parents: ["A", "B"] },
      { hash: "B", parents: ["base"] },
      { hash: "A", parents: ["base"] },
      { hash: "base", parents: [] },
    ]);

    expect(rows[0]).toMatchObject({ column: 0, colorIndex: 0 });
    expect(rows[0].lines).toEqual(
      expect.arrayContaining([
        { from: 0, to: 0, colorIndex: 0, fromMid: true },
        { from: 0, to: 1, colorIndex: 1, fromMid: true },
      ]),
    );
    expect(rows[1].column).toBe(1);
    expect(rows[2].column).toBe(0);
    expect(rows[3].column).toBe(0);
    expect(rows[3].lines).toEqual(
      expect.arrayContaining([{ from: 1, to: 0, colorIndex: 1, toMid: true }]),
    );
  });
});

describe("nodeLinkPath", () => {
  it("draws a straight vertical for the same column", () => {
    expect(nodeLinkPath(9, 10, 9, 80)).toBe("M 9 10 L 9 80");
  });

  it("branches out near the start, then runs vertically", () => {
    const d = nodeLinkPath(9, 10, 27, 90);
    expect(d.startsWith("M 9 10 C")).toBe(true);
    expect(d.endsWith("L 27 90")).toBe(true);
    expect(d.match(/C /g)?.length).toBe(2);
  });

  it("merges in with a vertical, then curves at the end", () => {
    const d = nodeLinkPath(27, 10, 9, 90);
    expect(d.startsWith("M 27 10 L 27")).toBe(true);
    expect(d.endsWith("9 90")).toBe(true);
    expect(d.match(/C /g)?.length).toBe(2);
  });
});

describe("commitGraphEdges", () => {
  it("links each commit to its parent node", () => {
    const rows = layoutCommitGraph([
      { hash: "c", parents: ["b"] },
      { hash: "b", parents: ["a"] },
      { hash: "a", parents: [] },
    ]);
    const geoms = [
      { nodeY: 10, bottom: 40 },
      { nodeY: 50, bottom: 80 },
      { nodeY: 90, bottom: 120 },
    ];
    const edges = commitGraphEdges(rows, geoms, 18);
    expect(edges).toEqual([
      { x1: 9, y1: 10, x2: 9, y2: 50, colorIndex: 0 },
      { x1: 9, y1: 50, x2: 9, y2: 90, colorIndex: 0 },
    ]);
  });
});
