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

/**
 * Era color mapping based on release decade.
 * Returns CSS class name for era-based styling.
 *
 * Era colors from the Temporal Design System:
 * - modern (2020s): Teal/Cyan
 * - contemporary (2010s): Cool blue
 * - recent (2000s): Purple
 * - classic (1990s): Warm orange
 * - vintage (1980s): Amber
 * - golden (1970s and earlier): Deep gold
 */
export type Era = 'modern' | 'contemporary' | 'recent' | 'classic' | 'vintage' | 'golden';

export function getEra(year: number | null | undefined): Era | null {
  if (!year) return null;

  if (year >= 2020) return 'modern';
  if (year >= 2010) return 'contemporary';
  if (year >= 2000) return 'recent';
  if (year >= 1990) return 'classic';
  if (year >= 1980) return 'vintage';
  return 'golden';
}

/**
 * Get CSS variable name for an era's color.
 * Use with hsl(): `hsl(var(${getEraColorVar('modern')}))`
 */
export function getEraColorVar(era: Era): string {
  return `--era-${era}`;
}
