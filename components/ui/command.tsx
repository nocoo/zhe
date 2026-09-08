"use client";

import {
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPalette,
} from "@nocoo/basalt/components/command-palette";
import { Command as CommandPrimitive } from "cmdk";

export const Command = CommandPrimitive;
export const CommandDialog = CommandPalette;
export { CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList };
