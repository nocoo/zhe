// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EditorSplit } from "@/components/dashboard/idea-editor-page-parts/editor-split";

afterEach(() => cleanup());

describe("EditorSplit", () => {
  it("frames editor and preview as L2 cards", () => {
    render(<EditorSplit content="hello" setContent={() => {}} />);
    expect(screen.getByRole("region", { name: "编辑" })).toHaveAttribute("data-basalt-surface");
    expect(screen.getByRole("region", { name: "预览" })).toHaveAttribute("data-basalt-surface");
    expect(screen.getByText("编辑", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("预览")).toBeInTheDocument();
  });
});
