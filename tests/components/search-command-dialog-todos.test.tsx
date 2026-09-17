// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SearchCommandDialog } from "@/components/search-command-dialog";
import { buildSearchDocument, toSearchHit } from "@/models/search";
import { withTheme } from "../test-utils";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/contexts/dashboard-service", () => ({
  useDashboardState: () => ({ siteUrl: "https://zhe.to" }),
}));
vi.mock("@/viewmodels/useSearch", () => ({
  useSearch: () => ({
    data: {
      total: 2,
      items: [
        toSearchHit(
          buildSearchDocument({
            kind: "todo",
            id: 42,
            title: "Task",
            content: "needle",
            done: true,
            tags: ["shopping"],
            createdAt: 1,
          }),
          "needle",
        ),
        toSearchHit(
          buildSearchDocument({
            kind: "idea",
            id: 21,
            title: "Idea",
            content: "needle",
            createdAt: 1,
          }),
          "needle",
        ),
      ],
    },
    loading: false,
  }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("opens directly matched full-body todo and idea results in their existing detail routes", () => {
  render(withTheme(<SearchCommandDialog open onOpenChange={vi.fn()} />));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "needle" } });
  expect(screen.getByText("已完成")).toBeInTheDocument();
  expect(screen.getByText("#shopping")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Task"));
  expect(push).toHaveBeenCalledWith("/dashboard/todos?id=42");
  fireEvent.click(screen.getByText("Idea"));
  expect(push).toHaveBeenCalledWith("/dashboard/ideas/21");
});
