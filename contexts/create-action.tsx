"use client";

import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

interface CreateAction {
  label: string;
  onClick: () => void;
  disabled?: boolean | undefined;
  expanded?: boolean | undefined;
}

const ActionContext = createContext<CreateAction | null>(null);
const RegisterContext = createContext<Dispatch<SetStateAction<CreateAction | null>> | null>(null);

export function CreateActionProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<CreateAction | null>(null);
  return (
    <RegisterContext value={setAction}>
      <ActionContext value={action}>{children}</ActionContext>
    </RegisterContext>
  );
}

export function usePageCreateAction({ label, onClick, disabled, expanded }: CreateAction) {
  const register = useContext(RegisterContext);
  const callback = useRef(onClick);
  useLayoutEffect(() => {
    callback.current = onClick;
  });
  useLayoutEffect(() => {
    if (!register) return;
    register({ label, disabled, expanded, onClick: () => callback.current() });
    return () => register(null);
  }, [register, label, disabled, expanded]);
}

export function useCurrentCreateAction() {
  return useContext(ActionContext);
}
