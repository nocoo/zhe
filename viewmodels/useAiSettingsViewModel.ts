"use client";

import { BUILTIN_PROVIDERS, type BuiltinProvider, CUSTOM_PROVIDER_INFO } from "@nocoo/next-ai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { AiSettingsPublic } from "@/models/ai-settings";

export const CUSTOM_MODEL_VALUE = "__custom__";
export const ALL_PROVIDER_IDS = [...Object.keys(BUILTIN_PROVIDERS), "custom"] as const;

export type AiTestStatus = "idle" | "testing" | "success" | "error";

const emptyPublic: AiSettingsPublic = {
  provider: "",
  model: "",
  baseURL: "",
  sdkType: "",
  authType: "",
  hasApiKey: false,
  apiKeyLast4: "",
};

export function useAiSettingsViewModel() {
  const [settings, setSettings] = useState<AiSettingsPublic>(emptyPublic);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyChanged, setApiKeyChanged] = useState(false);
  const [customModelInput, setCustomModelInput] = useState("");
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<AiTestStatus>("idle");
  const [testError, setTestError] = useState("");

  const isCustomProvider = settings.provider === "custom";
  const providerInfo =
    settings.provider && !isCustomProvider
      ? BUILTIN_PROVIDERS[settings.provider as BuiltinProvider]
      : null;
  const presetModels = providerInfo?.models ?? [];
  const canSubmit = Boolean(settings.provider);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/ai")
      .then((r) => r.json())
      .then((data: AiSettingsPublic) => {
        if (cancelled) return;
        setSettings(data);
        if (data.provider && data.provider !== "custom" && data.model) {
          const info = BUILTIN_PROVIDERS[data.provider as BuiltinProvider];
          if (info && !info.models.includes(data.model)) {
            setIsCustomModel(true);
            setCustomModelInput(data.model);
          }
        } else if (data.provider === "custom" && data.model) {
          setCustomModelInput(data.model);
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleProviderChange = useCallback((value: string) => {
    setTestStatus("idle");
    setIsCustomModel(false);
    setCustomModelInput("");
    if (!value) {
      setSettings((s) => ({
        ...s,
        provider: "",
        model: "",
        baseURL: "",
        sdkType: "",
        authType: "",
      }));
      return;
    }
    if (value === "custom") {
      setSettings((s) => ({
        ...s,
        provider: "custom",
        model: "",
        sdkType: s.sdkType || "openai",
        authType: s.authType || "apiKey",
      }));
      return;
    }
    const info = BUILTIN_PROVIDERS[value as BuiltinProvider];
    setSettings((s) => ({
      ...s,
      provider: value,
      model: info?.defaultModel ?? "",
      authType: "",
    }));
  }, []);

  const handleModelSelect = useCallback(
    (value: string) => {
      if (value === CUSTOM_MODEL_VALUE) {
        setIsCustomModel(true);
        setSettings((s) => ({ ...s, model: customModelInput }));
        return;
      }
      setIsCustomModel(false);
      setCustomModelInput("");
      setSettings((s) => ({ ...s, model: value }));
    },
    [customModelInput],
  );

  const handleSave = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        provider: settings.provider,
        model: settings.model,
      };
      if (apiKeyChanged) body.apiKey = apiKeyInput;
      if (isCustomProvider) {
        body.baseURL = settings.baseURL;
        body.sdkType = settings.sdkType;
        body.authType = settings.authType;
      } else {
        body.baseURL = "";
        body.sdkType = "";
        body.authType = "";
      }
      const res = await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as AiSettingsPublic & { error?: string };
      if (!res.ok) {
        toast.error(data.error || "保存失败");
        return false;
      }
      setSettings(data);
      setApiKeyInput("");
      setApiKeyChanged(false);
      toast.success("已保存");
      return true;
    } catch {
      toast.error("保存失败");
      return false;
    } finally {
      setSaving(false);
    }
  }, [settings, apiKeyChanged, apiKeyInput, isCustomProvider]);

  const handleTest = useCallback(async () => {
    const saved = await handleSave();
    if (!saved) return;
    setTestStatus("testing");
    setTestError("");
    try {
      const res = await fetch("/api/settings/ai/test", { method: "POST" });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (data.success) {
        setTestStatus("success");
      } else {
        setTestStatus("error");
        setTestError(data.error || "连接失败");
      }
    } catch {
      setTestStatus("error");
      setTestError("网络错误");
    }
    setTimeout(() => setTestStatus("idle"), 4000);
  }, [handleSave]);

  const providerOptions = useMemo(
    () =>
      ALL_PROVIDER_IDS.map((id) => ({
        id,
        label:
          id === "custom"
            ? CUSTOM_PROVIDER_INFO.label
            : BUILTIN_PROVIDERS[id as BuiltinProvider].label,
      })),
    [],
  );

  return {
    settings,
    setSettings,
    apiKeyInput,
    setApiKeyInput: (value: string) => {
      setApiKeyInput(value);
      setApiKeyChanged(true);
    },
    customModelInput,
    setCustomModelInput,
    isCustomModel,
    setIsCustomModel,
    isCustomProvider,
    providerInfo,
    presetModels,
    providerOptions,
    loaded,
    saving,
    testStatus,
    testError,
    canSubmit,
    handleProviderChange,
    handleModelSelect,
    handleSave,
    handleTest,
  };
}

export type AiSettingsViewModel = ReturnType<typeof useAiSettingsViewModel>;
