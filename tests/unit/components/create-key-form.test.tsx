// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreateKeyForm } from "@/components/dashboard/api-keys-page-parts/create-key-form";
import type { ApiScope } from "@/models/api-key";

const availableScopes: readonly ApiScope[] = [
  "links:read",
  "links:write",
  "tags:read",
  "tags:write",
];

describe("CreateKeyForm", () => {
  const setNewKeyName = vi.fn();
  const toggleScope = vi.fn();
  const setExpiresInDays = vi.fn();
  const onCancel = vi.fn();
  const onCreate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders form fields and handles name and cancellation", () => {
    render(
      <CreateKeyForm
        availableScopes={availableScopes}
        newKeyName="My Key"
        setNewKeyName={setNewKeyName}
        selectedScopes={["links:read"]}
        toggleScope={toggleScope}
        expiresInDays={30}
        setExpiresInDays={setExpiresInDays}
        isCreating={false}
        onCancel={onCancel}
        onCreate={onCreate}
      />,
    );

    const input = screen.getByTestId("key-name-input");
    expect(input).toHaveValue("My Key");
    fireEvent.change(input, { target: { value: "Updated Key" } });
    expect(setNewKeyName).toHaveBeenCalledWith("Updated Key");

    const cancelBtn = screen.getByTestId("cancel-create-btn");
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);

    const createBtn = screen.getByTestId("create-key-btn");
    expect(createBtn).not.toBeDisabled();
    expect(createBtn).toHaveTextContent("创建");
    fireEvent.click(createBtn);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("disables submit button when name is blank or no scopes selected or isCreating", () => {
    const { rerender } = render(
      <CreateKeyForm
        availableScopes={availableScopes}
        newKeyName="   "
        setNewKeyName={setNewKeyName}
        selectedScopes={["links:read"]}
        toggleScope={toggleScope}
        expiresInDays={null}
        setExpiresInDays={setExpiresInDays}
        isCreating={false}
        onCancel={onCancel}
        onCreate={onCreate}
      />,
    );
    expect(screen.getByTestId("create-key-btn")).toBeDisabled();

    // Empty scopes
    rerender(
      <CreateKeyForm
        availableScopes={availableScopes}
        newKeyName="Valid Name"
        setNewKeyName={setNewKeyName}
        selectedScopes={[]}
        toggleScope={toggleScope}
        expiresInDays={null}
        setExpiresInDays={setExpiresInDays}
        isCreating={false}
        onCancel={onCancel}
        onCreate={onCreate}
      />,
    );
    expect(screen.getByTestId("create-key-btn")).toBeDisabled();

    // isCreating true
    rerender(
      <CreateKeyForm
        availableScopes={availableScopes}
        newKeyName="Valid Name"
        setNewKeyName={setNewKeyName}
        selectedScopes={["links:read"]}
        toggleScope={toggleScope}
        expiresInDays={null}
        setExpiresInDays={setExpiresInDays}
        isCreating={true}
        onCancel={onCancel}
        onCreate={onCreate}
      />,
    );
    const btn = screen.getByTestId("create-key-btn");
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("创建中...");
  });

  it("handles scope checkbox toggles", () => {
    render(
      <CreateKeyForm
        availableScopes={availableScopes}
        newKeyName="My Key"
        setNewKeyName={setNewKeyName}
        selectedScopes={["links:read"]}
        toggleScope={toggleScope}
        expiresInDays={null}
        setExpiresInDays={setExpiresInDays}
        isCreating={false}
        onCancel={onCancel}
        onCreate={onCreate}
      />,
    );

    const readCheckbox = screen.getByTestId("scope-links:read");
    expect(readCheckbox).toBeChecked();

    const writeCheckbox = screen.getByTestId("scope-links:write");
    expect(writeCheckbox).not.toBeChecked();
    fireEvent.click(writeCheckbox);
    expect(toggleScope).toHaveBeenCalledWith("links:write");
  });
});
