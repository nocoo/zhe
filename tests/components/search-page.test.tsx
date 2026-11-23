// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SearchPage } from "@/components/search-page";

const { back, useSearch, currentParams } = vi.hoisted(() => ({
  back: vi.fn(),
  useSearch: vi.fn(),
  currentParams: { value: new URLSearchParams() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back }),
  useSearchParams: () => currentParams.value,
}));
vi.mock("@/viewmodels/useSearch", () => ({ useSearch }));

beforeEach(() => {
  vi.clearAllMocks();
  currentParams.value = new URLSearchParams();
  useSearch.mockReturnValue({ loading: false, retry: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("ignores self-triggered replaceState searchParams echoes while syncing external navigation", () => {
  vi.useFakeTimers();
  const replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  const view = render(<SearchPage />);
  const input = screen.getByRole("textbox", { name: "搜索关键词" });

  fireEvent.change(input, { target: { value: "a" } });
  act(() => {
    vi.advanceTimersByTime(250);
  });
  expect(replaceState).toHaveBeenCalledTimes(1);

  fireEvent.change(input, { target: { value: "ab" } });
  currentParams.value = new URLSearchParams("q=a");
  view.rerender(<SearchPage />);
  expect(input).toHaveValue("ab");

  currentParams.value = new URLSearchParams("q=external&source=github");
  view.rerender(<SearchPage />);
  expect(input).toHaveValue("external");
  expect(screen.getByRole("button", { name: "GitHub" })).toHaveAttribute("aria-pressed", "true");

  replaceState.mockRestore();
});
