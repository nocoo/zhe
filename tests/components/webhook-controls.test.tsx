// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/slider", () => ({
  Slider: (props: {
    onValueChange?: (values: number[]) => void;
    onValueCommit?: (values: number[]) => void;
  }) => (
    <div>
      <button
        type="button"
        data-testid="slider-change-empty"
        onClick={() => props.onValueChange?.([])}
      >
        change empty
      </button>
      <button
        type="button"
        data-testid="slider-commit-empty"
        onClick={() => props.onValueCommit?.([])}
      >
        commit empty
      </button>
    </div>
  ),
}));

import {
  RateLimitControl,
  WebhookActions,
} from "@/components/dashboard/webhook-page-parts/webhook-controls";

describe("WebhookActions", () => {
  it("disables regeneration and shows progress while generating", () => {
    const onGenerate = vi.fn();
    render(
      <WebhookActions
        isGenerating={true}
        isRevoking={false}
        onGenerate={onGenerate}
        onRevoke={vi.fn()}
      />,
    );
    const regenerate = screen.getByTestId("regenerate-token-btn");
    expect(regenerate).toBeDisabled();
    expect(regenerate).toHaveTextContent("生成中...");
    expect(screen.getByTestId("revoke-token-btn")).toHaveTextContent("撤销令牌");
    fireEvent.click(regenerate);
    expect(onGenerate).not.toHaveBeenCalled();
  });
});

describe("RateLimitControl", () => {
  it("keeps the current limit when the slider reports an empty payload", () => {
    const setRateLimit = vi.fn();
    const onCommit = vi.fn();
    render(<RateLimitControl rateLimit={5} setRateLimit={setRateLimit} onCommit={onCommit} />);
    expect(screen.getByTestId("rate-limit-value")).toHaveTextContent("5 次/分钟");
    fireEvent.click(screen.getByTestId("slider-change-empty"));
    expect(setRateLimit).toHaveBeenCalledWith(5);
    fireEvent.click(screen.getByTestId("slider-commit-empty"));
    expect(onCommit).toHaveBeenCalledWith(5);
  });
});
