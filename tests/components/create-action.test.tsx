// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  CreateActionProvider,
  useCurrentCreateAction,
  usePageCreateAction,
} from "@/contexts/create-action";

function Page({ onCreate, disabled }: { onCreate: () => void; disabled: boolean }) {
  usePageCreateAction({ label: "Create idea", onClick: onCreate, disabled });
  return null;
}
function Action() {
  const action = useCurrentCreateAction();
  return (
    <button type="button" onClick={action?.onClick} disabled={action?.disabled}>
      {action?.label ?? "Create link"}
    </button>
  );
}

it("updates the page callback and pending state, then restores the default on navigation", () => {
  const first = vi.fn();
  const latest = vi.fn();
  const { rerender } = render(
    <CreateActionProvider>
      <Page onCreate={first} disabled={false} />
      <Action />
    </CreateActionProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Create idea" }));
  expect(first).toHaveBeenCalledOnce();
  rerender(
    <CreateActionProvider>
      <Page onCreate={latest} disabled={false} />
      <Action />
    </CreateActionProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Create idea" }));
  expect(latest).toHaveBeenCalledOnce();
  rerender(
    <CreateActionProvider>
      <Page onCreate={latest} disabled />
      <Action />
    </CreateActionProvider>,
  );
  expect(screen.getByRole("button")).toBeDisabled();
  rerender(
    <CreateActionProvider>
      <Action />
    </CreateActionProvider>,
  );
  expect(screen.getByRole("button", { name: "Create link" })).toBeEnabled();
});
