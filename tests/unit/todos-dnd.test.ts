// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTodosDnd } from "@/viewmodels/todos/useTodosDnd";

function mountDnd(handleMoveTodo: (...args: unknown[]) => Promise<unknown>) {
  return renderHook(() =>
    useTodosDnd({ handleMoveTodo: handleMoveTodo as never }),
  );
}

describe("useTodosDnd — onArboristMove", () => {
  it("converts string ids to numbers and fans out consecutive positions on multi-select", async () => {
    const handleMoveTodo = vi.fn(async () => undefined);
    const { result } = mountDnd(handleMoveTodo);
    await result.current.onArboristMove({
      dragIds: ["10", "11"],
      parentId: "5",
      index: 2,
    });
    expect(handleMoveTodo).toHaveBeenNthCalledWith(1, 10, { parentId: 5, position: 2 });
    expect(handleMoveTodo).toHaveBeenNthCalledWith(2, 11, { parentId: 5, position: 3 });
  });

  it("normalises the arborist ROOT sentinel to null parent", async () => {
    const handleMoveTodo = vi.fn(async () => undefined);
    const { result } = mountDnd(handleMoveTodo);
    await result.current.onArboristMove({
      dragIds: ["7"],
      parentId: "__REACT_ARBORIST_INTERNAL_ROOT__",
      index: 0,
    });
    expect(handleMoveTodo).toHaveBeenCalledWith(7, { parentId: null, position: 0 });
  });

  it("throws when arborist hands us a non-numeric id", async () => {
    const handleMoveTodo = vi.fn(async () => undefined);
    const { result } = mountDnd(handleMoveTodo);
    await expect(
      result.current.onArboristMove({ dragIds: ["not-a-number"], parentId: null, index: 0 }),
    ).rejects.toThrow(/Invalid todo id/);
  });
});
