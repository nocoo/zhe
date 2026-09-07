// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

afterEach(() => cleanup());

describe("Card wrapper", () => {
  it("does not add LayerCard root padding on top of CardHeader/Content", () => {
    const { container } = render(
      <Card>
        <CardHeader>title</CardHeader>
        <CardContent>body</CardContent>
      </Card>,
    );
    const root = container.firstElementChild;
    expect(root?.className).not.toMatch(/\bp-4\b/);
    expect(root?.className).not.toMatch(/\bp-3\b/);
    expect(root?.className).not.toMatch(/\bp-6\b/);
  });
});
