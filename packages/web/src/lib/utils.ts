import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Atom } from "@effect-atom/atom-react";
import { BrowserKeyValueStore } from "@effect/platform-browser";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Runtime for localStorage-based KeyValueStore operations.
 *
 * Use with Atom.kvs() to create atoms that persist to localStorage.
 *
 * Example:
 * ```typescript
 * const playAtom = Atom.kvs({
 *   runtime: kvsRuntime,
 *   key: "timeline:play:123",
 *   schema: PlayResult,
 *   defaultValue: () => null
 * })
 * ```
 */
export const kvsRuntime = Atom.runtime(BrowserKeyValueStore.layerLocalStorage);
