// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PRE_LINK_NAV_GROUPS } from "@/components/sidebar-parts/nav-config";

describe("PRE_LINK_NAV_GROUPS", () => {
  it("puts the 待办 entry in the 概览 group directly after 想法", () => {
    const overview = PRE_LINK_NAV_GROUPS.find((g) => g.label === "概览");
    if (!overview) throw new Error("expected 概览 group");
    const titles = overview.items.map((i) => i.title);
    const ideasIdx = titles.indexOf("想法");
    const todosIdx = titles.indexOf("待办");
    // The doc pins the exact ordering: 概览 → 想法 → 待办, so a future
    // reshuffle has to update this test on purpose.
    expect(ideasIdx).toBeGreaterThanOrEqual(0);
    expect(todosIdx).toBe(ideasIdx + 1);
    const todos = overview.items[todosIdx];
    if (!todos) throw new Error("expected 待办 item");
    expect(todos.href).toBe("/dashboard/todos");
    expect(typeof todos.icon).toBe("object"); // lucide icon = ForwardRefExoticComponent
  });
});
