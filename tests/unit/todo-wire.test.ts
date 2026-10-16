// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  buildCreateTodoInput,
  buildMoveTodoInput,
  buildReorderPayload,
  buildUpdateTodoPatch,
  parseTodoIdParam,
  parseWireTodoId,
  resolveDueAt,
  resolveEmoji,
} from "@/models/todo-wire";

describe("todo-wire", () => {
  describe("resolveDueAt", () => {
    it("treats undefined as absent", () => {
      expect(resolveDueAt(undefined)).toEqual({ present: false });
    });

    it("clears on null", () => {
      expect(resolveDueAt(null)).toEqual({ present: true, value: null });
    });

    it("rejects non-finite numbers", () => {
      expect(() => resolveDueAt(Number.NaN)).toThrow("Due date must be a finite timestamp");
    });
  });

  describe("resolveEmoji", () => {
    it("rejects long strings", () => {
      expect(() => resolveEmoji("123456789")).toThrow("Emoji must be a short string or null");
    });
  });

  describe("buildCreateTodoInput", () => {
    it("requires non-empty title", () => {
      expect(buildCreateTodoInput({ title: "  " })).toEqual({ error: "Title cannot be empty" });
    });

    it("builds scoped input", () => {
      const result = buildCreateTodoInput({ title: "Task", dueAtMs: 1_700_000_000_000 });
      expect(result).toHaveProperty("input");
      if ("input" in result) {
        expect(result.input.title).toBe("Task");
        expect(result.input.dueAt).toEqual(new Date(1_700_000_000_000));
      }
    });
  });

  describe("buildUpdateTodoPatch", () => {
    it("rejects empty title patch", () => {
      expect(buildUpdateTodoPatch({ title: "  " })).toEqual({ error: "Title cannot be empty" });
    });
  });

  describe("buildMoveTodoInput", () => {
    it("requires position", () => {
      expect(buildMoveTodoInput({ parentId: null })).toEqual({ error: "Missing 'position' field" });
    });
  });

  describe("buildReorderPayload", () => {
    it("validates orderedIds", () => {
      expect(buildReorderPayload(null, ["x"])).toEqual({ error: "orderedIds must be integers" });
    });
  });

  describe("parseTodoIdParam", () => {
    it("accepts positive decimal ids", () => {
      expect(parseTodoIdParam("42")).toBe(42);
    });

    it("rejects partial parses", () => {
      expect(parseTodoIdParam("1.5")).toBeNull();
      expect(parseTodoIdParam("1foreign")).toBeNull();
      expect(parseTodoIdParam("1e3")).toBeNull();
      expect(parseTodoIdParam("01")).toBeNull();
    });
  });

  describe("parseWireTodoId", () => {
    it("rejects non-safe integers", () => {
      expect(parseWireTodoId(1.5)).toBe("invalid");
      expect(parseWireTodoId(0)).toBe("invalid");
    });
  });
});
