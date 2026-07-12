// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { TodoDueChip } from "@/components/dashboard/todo-due-chip";

afterEach(() => cleanup());

const local = (y: number, m: number, d: number, h = 0, mi = 0) =>
  new Date(y, m - 1, d, h, mi, 0, 0);

const localEndOfDay = (y: number, m: number, d: number) =>
  new Date(y, m - 1, d, 23, 59, 59, 999);

describe("TodoDueChip", () => {
  const now = local(2026, 7, 10, 10, 30); // ref time

  it("renders nothing when dueAt is null (no-due)", () => {
    const { container } = render(<TodoDueChip dueAt={null} done={false} now={now} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders an `overdue` chip when dueAt is strictly before start-of-today", () => {
    const { container } = render(
      <TodoDueChip dueAt={localEndOfDay(2026, 7, 9)} done={false} now={now} />,
    );
    const chip = container.querySelector('[data-due-kind="overdue"]');
    expect(chip?.textContent).toContain("逾期");
    expect(chip?.textContent).toContain("7月9日");
  });

  it("renders `today` for dueAt anywhere in today's local window", () => {
    const { container } = render(
      <TodoDueChip dueAt={localEndOfDay(2026, 7, 10)} done={false} now={now} />,
    );
    expect(container.querySelector('[data-due-kind="today"]')?.textContent).toContain(
      "今日",
    );
  });

  it("renders `tomorrow` for the next local day", () => {
    const { container } = render(
      <TodoDueChip dueAt={localEndOfDay(2026, 7, 11)} done={false} now={now} />,
    );
    expect(container.querySelector('[data-due-kind="tomorrow"]')?.textContent).toContain(
      "明日",
    );
  });

  it("renders `soon` within the 7-day window", () => {
    const { container } = render(
      <TodoDueChip dueAt={localEndOfDay(2026, 7, 15)} done={false} now={now} />,
    );
    expect(container.querySelector('[data-due-kind="soon"]')?.textContent).toContain(
      "7月15日",
    );
  });

  it("renders `later` past the 7-day window", () => {
    const { container } = render(
      <TodoDueChip dueAt={localEndOfDay(2026, 8, 3)} done={false} now={now} />,
    );
    expect(container.querySelector('[data-due-kind="later"]')?.textContent).toContain(
      "8月3日",
    );
  });

  it("flips to low-emphasis `done-with-due` when done=true, regardless of dueAt", () => {
    const past = render(
      <TodoDueChip dueAt={localEndOfDay(2026, 7, 8)} done={true} now={now} />,
    );
    expect(past.container.querySelector('[data-due-kind="done-with-due"]')?.textContent).toContain(
      "原定 7月8日",
    );

    cleanup();

    const future = render(
      <TodoDueChip dueAt={localEndOfDay(2026, 7, 30)} done={true} now={now} />,
    );
    // Even a future dueAt on a done row uses the same low-emphasis kind.
    expect(future.container.querySelector('[data-due-kind="done-with-due"]')).toBeTruthy();
  });

  it("keeps the year on a cross-year `later` chip", () => {
    const { container } = render(
      <TodoDueChip dueAt={localEndOfDay(2027, 1, 5)} done={false} now={now} />,
    );
    expect(container.querySelector('[data-due-kind="later"]')?.textContent).toContain(
      "2027年1月5日",
    );
  });
});
