// @vitest-environment node
/**
 * L1 unit tests for `actions/todos.ts`.
 *
 * Mocks `ScopedDB` at the module boundary so we only exercise the
 * server-action surface: auth gating, validation, and the typed-error →
 * `ActionResult.error` mapping. The scoped-db side is covered by
 * `tests/unit/lib/db/scoped/todos.test.ts`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// -----------------------------------------------------------------------------
// Mocks — declared before importing the module under test
// -----------------------------------------------------------------------------

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockGetTodos = vi.fn();
const mockGetTodoById = vi.fn();
const mockGetTodoTags = vi.fn();
const mockCreateTodo = vi.fn();
const mockUpdateTodo = vi.fn();
const mockMoveTodo = vi.fn();
const mockReorderSiblings = vi.fn();
const mockDeleteTodo = vi.fn();

vi.mock('@/lib/db/scoped', async () => {
  // Re-export the real typed errors so `instanceof` checks in the action
  // work; only the ScopedDB class is mocked.
  const actual =
    await vi.importActual<typeof import('@/lib/db/scoped')>('@/lib/db/scoped');
  return {
    ...actual,
    ScopedDB: vi.fn().mockImplementation(function () {
      return {
        getTodos: mockGetTodos,
        getTodoById: mockGetTodoById,
        getTodoTags: mockGetTodoTags,
        createTodo: mockCreateTodo,
        updateTodo: mockUpdateTodo,
        moveTodo: mockMoveTodo,
        reorderSiblings: mockReorderSiblings,
        deleteTodo: mockDeleteTodo,
      };
    }),
  };
});

// Suppress console.error noise from catch blocks in the SUT.
vi.spyOn(console, 'error').mockImplementation(() => {});

// -----------------------------------------------------------------------------
// SUT + typed errors (imported AFTER mocks are set up)
// -----------------------------------------------------------------------------

import {
  createTodo,
  deleteTodo,
  getTodo,
  getTodoTags,
  getTodos,
  moveTodo,
  reorderTodoSiblings,
  updateTodo,
} from '@/actions/todos';
import {
  TodoDepthExceededError,
  TodoMoveConflictError,
  TodoNotFoundError,
} from '@/lib/db/scoped';

const FAKE_USER_ID = 'user-abc-123';

function authed() {
  return { user: { id: FAKE_USER_ID, name: 'Test', email: 't@t' } };
}

const FAKE_TREE_NODE = {
  id: 1,
  parentId: null,
  position: 0,
  title: 'root',
  done: false,
  hasContent: false,
  tagNames: [],
  dueAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const FAKE_DETAIL = {
  ...FAKE_TREE_NODE,
  content: '# hi',
  excerpt: 'hi',
  doneAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Auth gate                                                                  */
/* -------------------------------------------------------------------------- */

describe('auth gating (all actions)', () => {
  beforeEach(() => mockAuth.mockResolvedValue(null));

  it('rejects every action with Unauthorized when session is missing', async () => {
    for (const [label, fn] of [
      ['getTodos', () => getTodos()],
      ['getTodo', () => getTodo(1)],
      ['getTodoTags', () => getTodoTags()],
      ['createTodo', () => createTodo({ title: 't' })],
      ['updateTodo', () => updateTodo(1, { title: 'x' })],
      ['moveTodo', () => moveTodo(1, { parentId: null, position: 0 })],
      ['reorderTodoSiblings', () => reorderTodoSiblings(null, [1])],
      ['deleteTodo', () => deleteTodo(1)],
    ] as const) {
      const result = await fn();
      expect(result, `${label} should be Unauthorized`).toEqual({
        success: false,
        error: 'Unauthorized',
      });
    }
    // None of the ScopedDB methods should have been called when auth fails.
    expect(mockGetTodos).not.toHaveBeenCalled();
    expect(mockCreateTodo).not.toHaveBeenCalled();
    expect(mockMoveTodo).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

describe('reads', () => {
  beforeEach(() => mockAuth.mockResolvedValue(authed()));

  it('getTodos returns the scoped list', async () => {
    mockGetTodos.mockResolvedValue([FAKE_TREE_NODE]);
    const result = await getTodos();
    expect(result).toEqual({ success: true, data: [FAKE_TREE_NODE] });
  });

  it('getTodo returns detail on hit and 404 on miss', async () => {
    mockGetTodoById.mockResolvedValueOnce(FAKE_DETAIL);
    expect(await getTodo(1)).toEqual({ success: true, data: FAKE_DETAIL });

    mockGetTodoById.mockResolvedValueOnce(null);
    expect(await getTodo(2)).toEqual({ success: false, error: 'Todo not found' });
  });

  it('getTodoTags surfaces the distinct name list', async () => {
    mockGetTodoTags.mockResolvedValue(['home', 'work']);
    expect(await getTodoTags()).toEqual({
      success: true,
      data: ['home', 'work'],
    });
  });

  it('surface generic failure when ScopedDB throws', async () => {
    mockGetTodos.mockRejectedValue(new Error('boom'));
    expect(await getTodos()).toEqual({
      success: false,
      error: 'Failed to get todos',
    });
  });
});

/* -------------------------------------------------------------------------- */
/* createTodo                                                                 */
/* -------------------------------------------------------------------------- */

describe('createTodo', () => {
  beforeEach(() => mockAuth.mockResolvedValue(authed()));

  it('rejects a blank title without touching the DB', async () => {
    const result = await createTodo({ title: '   ' });
    expect(result).toEqual({ success: false, error: 'Title cannot be empty' });
    expect(mockCreateTodo).not.toHaveBeenCalled();
  });

  it('forwards title / parentId / content / dueAtMs / tagNames', async () => {
    mockCreateTodo.mockResolvedValue(FAKE_DETAIL);
    const result = await createTodo({
      title: '  keep-me  ',
      parentId: 4,
      content: '# body',
      dueAtMs: 1_700_000_000_000,
      tagNames: ['work'],
    });
    expect(result).toEqual({ success: true, data: FAKE_DETAIL });
    // The ScopedDB layer canonicalises the title; the action trims into it.
    expect(mockCreateTodo).toHaveBeenCalledWith({
      title: 'keep-me',
      parentId: 4,
      content: '# body',
      dueAt: new Date(1_700_000_000_000),
      tagNames: ['work'],
    });
  });

  it('translates dueAtMs=null to a null Date so ScopedDB clears the column', async () => {
    mockCreateTodo.mockResolvedValue(FAKE_DETAIL);
    await createTodo({ title: 't', dueAtMs: null });
    expect(mockCreateTodo).toHaveBeenCalledWith({ title: 't', dueAt: null });
  });

  it('maps TodoNotFoundError from the DB to "Parent todo not found"', async () => {
    mockCreateTodo.mockRejectedValue(new TodoNotFoundError('Parent todo not found'));
    expect(await createTodo({ title: 't', parentId: 999 })).toEqual({
      success: false,
      error: 'Parent todo not found',
    });
  });

  it('maps TodoDepthExceededError to the stable depth error', async () => {
    mockCreateTodo.mockRejectedValue(new TodoDepthExceededError());
    expect(await createTodo({ title: 't', parentId: 1 })).toEqual({
      success: false,
      error: 'Todo depth would exceed the maximum',
    });
  });

  it('falls back to generic "Failed to create todo" for unknown throws', async () => {
    mockCreateTodo.mockRejectedValue(new Error('boom'));
    expect(await createTodo({ title: 't' })).toEqual({
      success: false,
      error: 'Failed to create todo',
    });
  });

  it('rejects a non-integer parentId without touching the DB', async () => {
    expect(
      await createTodo({ title: 't', parentId: 1.5 as unknown as number }),
    ).toEqual({ success: false, error: 'Parent id must be an integer or null' });
    expect(mockCreateTodo).not.toHaveBeenCalled();
  });

  it('accepts parentId null (root) and integer parentId', async () => {
    mockCreateTodo.mockResolvedValue(FAKE_DETAIL);
    expect(await createTodo({ title: 't', parentId: null })).toEqual({
      success: true,
      data: FAKE_DETAIL,
    });
    expect(mockCreateTodo).toHaveBeenLastCalledWith({ title: 't', parentId: null });
    mockCreateTodo.mockResolvedValue(FAKE_DETAIL);
    await createTodo({ title: 't', parentId: 7 });
    expect(mockCreateTodo).toHaveBeenLastCalledWith({ title: 't', parentId: 7 });
  });

  it('rejects a non-finite dueAtMs (NaN / Infinity) without touching the DB', async () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = await createTodo({ title: 't', dueAtMs: bad });
      expect(result).toEqual({
        success: false,
        error: 'Due date must be a finite timestamp',
      });
    }
    expect(mockCreateTodo).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* updateTodo                                                                 */
/* -------------------------------------------------------------------------- */

describe('updateTodo', () => {
  beforeEach(() => mockAuth.mockResolvedValue(authed()));

  it('rejects a blank title but only when the caller sends one', async () => {
    // Present but blank — reject.
    expect(await updateTodo(1, { title: '   ' })).toEqual({
      success: false,
      error: 'Title cannot be empty',
    });
    expect(mockUpdateTodo).not.toHaveBeenCalled();

    // Omitted — patch other fields, must not error on the title check.
    mockUpdateTodo.mockResolvedValue(FAKE_DETAIL);
    expect(await updateTodo(1, { done: true })).toEqual({
      success: true,
      data: FAKE_DETAIL,
    });
    expect(mockUpdateTodo).toHaveBeenCalledWith(1, { done: true });
  });

  it('forwards only provided keys into the ScopedDB patch', async () => {
    mockUpdateTodo.mockResolvedValue(FAKE_DETAIL);
    await updateTodo(7, {
      title: '  keep-me  ',
      content: null,
      done: false,
      dueAtMs: 1_700_000_000_000,
      tagNames: ['home'],
    });
    expect(mockUpdateTodo).toHaveBeenCalledWith(7, {
      title: 'keep-me',
      content: null,
      done: false,
      dueAt: new Date(1_700_000_000_000),
      tagNames: ['home'],
    });
  });

  it('returns 404 when ScopedDB signals the row is missing', async () => {
    mockUpdateTodo.mockResolvedValue(null);
    expect(await updateTodo(9, { done: true })).toEqual({
      success: false,
      error: 'Todo not found',
    });
  });

  it('rejects a non-finite dueAtMs (NaN / Infinity) without touching the DB', async () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = await updateTodo(1, { dueAtMs: bad });
      expect(result).toEqual({
        success: false,
        error: 'Due date must be a finite timestamp',
      });
    }
    expect(mockUpdateTodo).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* moveTodo                                                                   */
/* -------------------------------------------------------------------------- */

describe('moveTodo', () => {
  beforeEach(() => mockAuth.mockResolvedValue(authed()));

  it('rejects a negative or non-integer position without touching the DB', async () => {
    expect(await moveTodo(1, { parentId: null, position: -1 })).toEqual({
      success: false,
      error: 'Position must be a non-negative integer',
    });
    expect(await moveTodo(1, { parentId: null, position: 1.5 })).toEqual({
      success: false,
      error: 'Position must be a non-negative integer',
    });
    expect(mockMoveTodo).not.toHaveBeenCalled();
  });

  it('rejects a non-integer parentId', async () => {
    expect(
      await moveTodo(1, { parentId: 1.5 as unknown as number, position: 0 }),
    ).toEqual({ success: false, error: 'Parent id must be an integer or null' });
    expect(mockMoveTodo).not.toHaveBeenCalled();
  });

  it('forwards a valid move and returns the affected slice', async () => {
    const slice = {
      movedId: 1,
      oldParentId: null,
      newParentId: 2,
      oldParentSiblings: [],
      newParentSiblings: [1],
    };
    mockMoveTodo.mockResolvedValue(slice);
    expect(
      await moveTodo(1, { parentId: 2, position: 0 }),
    ).toEqual({ success: true, data: slice });
    expect(mockMoveTodo).toHaveBeenCalledWith(1, {
      parentId: 2,
      position: 0,
    });
  });

  it('maps typed ScopedDB errors to stable strings', async () => {
    mockMoveTodo.mockRejectedValueOnce(new TodoMoveConflictError());
    expect(await moveTodo(1, { parentId: 2, position: 0 })).toEqual({
      success: false,
      error: 'Move conflicted or invalid',
    });

    mockMoveTodo.mockRejectedValueOnce(new TodoNotFoundError());
    expect(await moveTodo(1, { parentId: 2, position: 0 })).toEqual({
      success: false,
      error: 'Todo not found',
    });

    mockMoveTodo.mockRejectedValueOnce(new TodoDepthExceededError());
    expect(await moveTodo(1, { parentId: 2, position: 0 })).toEqual({
      success: false,
      error: 'Todo depth would exceed the maximum',
    });
  });

  it('never throws — an unknown error still returns a generic failure envelope', async () => {
    mockMoveTodo.mockRejectedValue(new Error('boom'));
    await expect(
      moveTodo(1, { parentId: 2, position: 0 }),
    ).resolves.toEqual({ success: false, error: 'Failed to move todo' });
  });
});

/* -------------------------------------------------------------------------- */
/* reorderTodoSiblings                                                        */
/* -------------------------------------------------------------------------- */

describe('reorderTodoSiblings', () => {
  beforeEach(() => mockAuth.mockResolvedValue(authed()));

  it('rejects a non-integer id in the list without touching the DB', async () => {
    expect(
      await reorderTodoSiblings(null, [1, 2.5 as unknown as number]),
    ).toEqual({ success: false, error: 'orderedIds must be integers' });
    expect(mockReorderSiblings).not.toHaveBeenCalled();
  });

  it('forwards to ScopedDB.reorderSiblings and mirrors the returned order', async () => {
    mockReorderSiblings.mockResolvedValue([2, 1, 3]);
    expect(await reorderTodoSiblings(4, [2, 1, 3])).toEqual({
      success: true,
      data: [2, 1, 3],
    });
    expect(mockReorderSiblings).toHaveBeenCalledWith(4, [2, 1, 3]);
  });

  it('maps TodoMoveConflictError to the stable reorder-conflict string', async () => {
    mockReorderSiblings.mockRejectedValue(new TodoMoveConflictError());
    expect(await reorderTodoSiblings(4, [1])).toEqual({
      success: false,
      error: 'Reorder conflicted or invalid',
    });
  });
});

/* -------------------------------------------------------------------------- */
/* deleteTodo                                                                 */
/* -------------------------------------------------------------------------- */

describe('deleteTodo', () => {
  beforeEach(() => mockAuth.mockResolvedValue(authed()));

  it('returns success when the row was removed', async () => {
    mockDeleteTodo.mockResolvedValue(true);
    expect(await deleteTodo(1)).toEqual({ success: true });
  });

  it('returns 404 when the row was not present', async () => {
    mockDeleteTodo.mockResolvedValue(false);
    expect(await deleteTodo(1)).toEqual({
      success: false,
      error: 'Todo not found',
    });
  });

  it('returns generic failure on unexpected throws', async () => {
    mockDeleteTodo.mockRejectedValue(new Error('boom'));
    expect(await deleteTodo(1)).toEqual({
      success: false,
      error: 'Failed to delete todo',
    });
  });
});
