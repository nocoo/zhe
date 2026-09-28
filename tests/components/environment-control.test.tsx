// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EnvironmentControl } from "@/components/environment-control";

afterEach(() => {
  delete window.__ZHE_LOCAL__;
  vi.restoreAllMocks();
});
it("keeps hosted pages free of the local control", () => {
  render(<EnvironmentControl />);
  expect(screen.queryByRole("group", { name: "Environment" })).toBeNull();
});
it("locks only automation and does not read or overwrite preferences", () => {
  window.__ZHE_LOCAL__ = { id: "automated", mode: "e2e", intent: "automation" };
  const read = vi.spyOn(Storage.prototype, "getItem");
  const write = vi.spyOn(Storage.prototype, "setItem");
  render(<EnvironmentControl />);
  expect(screen.getByRole("radio", { name: "Demo" })).toBeDisabled();
  expect(screen.getByRole("radio", { name: "Prod" })).toBeDisabled();
  expect(read).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
});
it("cancels dirty manual E2E exit without requests or preference changes", () => {
  window.__ZHE_LOCAL__ = { id: "manual", mode: "e2e", intent: "interactive" };
  const request = vi.spyOn(window, "fetch");
  window.confirm = vi.fn(() => false);
  render(<EnvironmentControl />);
  fireEvent.input(document.body);
  fireEvent.click(screen.getByRole("radio", { name: "Demo" }));
  expect(window.confirm).toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
  expect(screen.getByRole("radio", { name: "E2E" })).toHaveAttribute("aria-checked", "true");
});
