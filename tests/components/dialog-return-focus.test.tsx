// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { useDialogReturnFocus } from "@/hooks/use-dialog-return-focus";

function Harness({ show = true }: { show?: boolean }) {
  const focus = useDialogReturnFocus();
  return (
    <>
      {show && (
        <button type="button" onClick={focus.onOpenAutoFocus}>
          Open
        </button>
      )}
      <button
        type="button"
        onClick={() => focus.onCloseAutoFocus(new Event("close", { cancelable: true }))}
      >
        Close
      </button>
    </>
  );
}

it("restores a connected trigger and tolerates deletion while the dialog is open", () => {
  const { rerender } = render(<Harness />);
  const open = screen.getByRole("button", { name: "Open" });
  const close = screen.getByRole("button", { name: "Close" });
  open.focus();
  fireEvent.click(open);
  close.focus();
  fireEvent.click(close);
  expect(open).toHaveFocus();
  rerender(<Harness show={false} />);
  close.focus();
  fireEvent.click(close);
  expect(close).toHaveFocus();
});
