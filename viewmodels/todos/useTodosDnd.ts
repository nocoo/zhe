"use client";

import { useCallback } from "react";

/**
 * Adapt react-arborist's callback shape into our server-action mutations.
 *
 * Arborist emits string ids (it doesn't know about our numeric PKs) so we
 * parse each id back to `number` at the boundary. `parentId === null`
 * means "drop to root" — arborist expresses that with the literal string
 * `"__REACT_ARBORIST_INTERNAL_ROOT__"` in some versions, so we normalise
 * that to `null` here.
 *
 * `onMove` covers both drag-reparent and drag-reorder within one parent
 * — the ScopedDB layer forks internally on `oldParent === newParent`, so
 * one call site is enough.
 */
export interface TodosDndCallbacks {
  handleMoveTodo: (
    id: number,
    input: { parentId: number | null; position: number },
  ) => Promise<unknown>;
}

const ARBORIST_ROOT_SENTINEL = "__REACT_ARBORIST_INTERNAL_ROOT__";

function toNumericId(raw: string | null): number | null {
  if (raw === null || raw === ARBORIST_ROOT_SENTINEL) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`Invalid todo id from tree control: ${raw}`);
  }
  return n;
}

export function useTodosDnd({ handleMoveTodo }: TodosDndCallbacks) {
  /**
   * Arborist calls this with the drag payload. We flip through each
   * dragged id sequentially; a multi-select drag lands them at
   * consecutive positions starting at `index`.
   */
  const onArboristMove = useCallback(
    async ({
      dragIds,
      parentId,
      index,
    }: {
      dragIds: string[];
      parentId: string | null;
      index: number;
    }) => {
      const targetParent = toNumericId(parentId);
      for (let i = 0; i < dragIds.length; i += 1) {
        const rawId = dragIds[i];
        if (rawId === undefined) continue;
        const id = toNumericId(rawId);
        if (id === null) continue; // arborist should never hand us the root as a drag id
        await handleMoveTodo(id, {
          parentId: targetParent,
          position: index + i,
        });
      }
    },
    [handleMoveTodo],
  );

  return { onArboristMove };
}
