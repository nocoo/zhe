// @vitest-environment happy-dom
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EnvironmentControl } from "@/components/environment-control";
import { useEnvironmentViewModel } from "@/viewmodels/useEnvironmentViewModel";

afterEach(() => {
  delete window.__ZHE_LOCAL__;
  vi.restoreAllMocks();
});
it("keeps hosted pages free of the local control", () => {
  render(<EnvironmentControl />);
  expect(screen.queryByRole("radiogroup", { name: "Environment" })).toBeNull();
});

it("rejects switching outside interactive mode, redundant choices and concurrent requests", async () => {
  const request = vi.spyOn(window, "fetch").mockImplementation(() => new Promise(() => {}));
  const hosted = renderHook(useEnvironmentViewModel);
  await act(() => hosted.result.current.select("demo"));
  hosted.unmount();
  window.__ZHE_LOCAL__ = { id: "automation", mode: "e2e", intent: "automation" };
  const automated = renderHook(useEnvironmentViewModel);
  await act(() => automated.result.current.select("prod"));
  automated.unmount();
  window.__ZHE_LOCAL__ = { id: "manual", mode: "demo", intent: "interactive" };
  const manual = renderHook(useEnvironmentViewModel);
  await act(() => manual.result.current.select("demo"));
  await act(() => manual.result.current.select("invalid"));
  expect(request).not.toHaveBeenCalled();
  act(() => {
    void manual.result.current.select("e2e");
  });
  await act(() => manual.result.current.select("prod"));
  expect(request).toHaveBeenCalledTimes(1);
  manual.unmount();
});

it("honors an editor's unload guard even without a captured input event", () => {
  window.__ZHE_LOCAL__ = { id: "manual", mode: "demo", intent: "interactive" };
  const guard = (event: Event) => event.preventDefault();
  window.addEventListener("beforeunload", guard);
  window.confirm = vi.fn(() => false);
  const request = vi.spyOn(window, "fetch");
  try {
    render(<EnvironmentControl />);
    fireEvent.click(screen.getByRole("radio", { name: "E2E" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener("beforeunload", guard);
  }
});

it("moves selection immediately while awaiting the server and rolls back on failure", async () => {
  window.__ZHE_LOCAL__ = { id: "manual", mode: "demo", intent: "interactive" };
  let finish!: (response: Response) => void;
  const request = vi.spyOn(window, "fetch").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const write = vi.spyOn(localStorage, "setItem");
  render(<EnvironmentControl />);
  fireEvent.click(screen.getByRole("radio", { name: "E2E" }));
  expect(screen.getByRole("radio", { name: "E2E" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("radiogroup", { name: "Environment" })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  expect(screen.getByRole("status")).toHaveTextContent("Switching environment");
  fireEvent.click(screen.getByRole("radio", { name: "Prod" }));
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith(
    "/_local/select",
    expect.objectContaining({
      headers: expect.objectContaining({ "x-zhe-instance": "manual" }),
      body: JSON.stringify({ mode: "e2e" }),
    }),
  );
  await act(async () => finish(new Response("Startup failed", { status: 502 })));
  expect(screen.getByRole("alert")).toHaveTextContent("Startup failed");
  expect(screen.getByRole("radio", { name: "Demo" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("radio", { name: "E2E" })).toBeEnabled();
  expect(write).not.toHaveBeenCalled();
});

it.each([false, true])(
  "persists only the accepted mode and reloads even if storage is unavailable (%s)",
  async (storageUnavailable) => {
    window.__ZHE_LOCAL__ = { id: "manual", mode: "demo", intent: "interactive" };
    vi.spyOn(window, "fetch").mockResolvedValue(Response.json({ mode: "e2e" }));
    const write = vi.spyOn(localStorage, "setItem");
    if (storageUnavailable)
      write.mockImplementation(() => {
        throw new Error("Storage blocked");
      });
    const navigate = vi.spyOn(window.location, "replace").mockImplementation(() => {});
    window.confirm = vi.fn(() => true);
    render(<EnvironmentControl />);
    fireEvent.input(document.body);
    fireEvent.click(screen.getByRole("radio", { name: "E2E" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
    expect(write).toHaveBeenCalledWith("zhe:environment-mode", "e2e");
  },
);

it("shows a retryable message for network failure without changing the current mode", async () => {
  window.__ZHE_LOCAL__ = { id: "manual", mode: "demo", intent: "interactive" };
  vi.spyOn(window, "fetch").mockRejectedValue("Connection lost");
  render(<EnvironmentControl />);
  fireEvent.click(screen.getByRole("radio", { name: "E2E" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Environment switch failed");
  expect(screen.getByRole("radio", { name: "Demo" })).toHaveAttribute("aria-checked", "true");
});
it("locks only automation and does not read or overwrite preferences", () => {
  window.__ZHE_LOCAL__ = { id: "automated", mode: "e2e", intent: "automation" };
  const read = vi.spyOn(localStorage, "getItem");
  const write = vi.spyOn(localStorage, "setItem");
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
