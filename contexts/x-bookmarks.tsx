"use client";
import { createContext } from "react";
import type { XBookmark } from "@/lib/connector/jobs";

export const XBookmarksContext = createContext(new Map<number, XBookmark>());
