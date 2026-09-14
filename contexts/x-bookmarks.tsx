"use client";
import { createContext, type Dispatch, type SetStateAction } from "react";
import type { XBookmark } from "@/lib/connector/jobs";

export const XBookmarksContext = createContext(new Map<number, XBookmark>());

export const XBookmarksUpdateContext = createContext<
  Dispatch<SetStateAction<Map<number, XBookmark>>>
>(() => {});
