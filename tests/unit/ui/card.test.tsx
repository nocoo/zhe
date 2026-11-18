// @vitest-environment happy-dom

import { LayerCard } from "@nocoo/basalt";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => cleanup());

describe("Card wrapper", () => {
  it("does not add LayerCard root padding on top of CardHeader/Content", () => {
    const { container } = render(
      <LayerCard padding="none">
        <LayerCard.Header>title</LayerCard.Header>
        <LayerCard.Body>body</LayerCard.Body>
      </LayerCard>,
    );
    const root = container.firstElementChild;
    expect(root?.className).not.toMatch(/\bp-4\b/);
    expect(root?.className).not.toMatch(/\bp-3\b/);
    expect(root?.className).not.toMatch(/\bp-6\b/);
  });
});
