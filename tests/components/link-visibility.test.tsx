// @vitest-environment happy-dom
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShowHiddenButton } from "@/components/dashboard/link-visibility";

describe("ShowHiddenButton", () => {
  it("reflects the pressed state and toggles hidden post display", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<ShowHiddenButton showHidden={false} onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: "展示隐藏" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    rerender(<ShowHiddenButton showHidden={true} onToggle={onToggle} />);
    const button = screen.getByRole("button", { name: "展示隐藏" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

const openEnrichment = vi.fn();
vi.mock("@/contexts/enrichment", () => ({ useOpenEnrichment: () => openEnrichment }));

import { useLinkSecondaryActions } from "@/components/dashboard/use-link-secondary-actions";

it("shares visibility and enrichment callbacks without changing link ownership", () => {
  const toggle = vi.fn();
  const { result, rerender } = renderHook(
    ({ hidden, pending }) => useLinkSecondaryActions({ id: 7, isHidden: hidden }, pending, toggle),
    { initialProps: { hidden: false, pending: false } },
  );
  expect(result.current[0]).toMatchObject({ label: "隐藏帖子", disabled: false });
  result.current[0]?.onSelect();
  result.current[1]?.onSelect();
  expect(toggle).toHaveBeenCalledTimes(1);
  expect(openEnrichment).toHaveBeenCalledWith({ linkId: 7 });
  rerender({ hidden: true, pending: true });
  expect(result.current[0]).toMatchObject({ label: "取消隐藏", disabled: true, pending: true });
});
