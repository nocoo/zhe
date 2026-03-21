#!/usr/bin/env bash
# Sourced by git hooks to check tool availability before running advisory checks.
# Returns 1 (skip) when a tool is missing — callers use: if check_tool ...; then ...

check_tool() {
  if ! command -v "$1" &>/dev/null; then
    echo "⚠️  $1 not found — skipping $2. Install: brew install $1"
    return 1
  fi
  return 0
}
