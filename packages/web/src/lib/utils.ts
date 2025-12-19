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

/**
 * Get a human-readable label for a year's decade.
 * Returns "70s", "80s", etc.
 */
export function getDecadeLabel(year: number | null | undefined): string | null {
  if (!year) return null;
  const decade = Math.floor(year / 10) * 10;
  return `${decade % 100}s`;
}

/**
 * Get era info from a year - combines era, label, and color class
 */
export interface EraInfo {
  era: Era;
  label: string;      // "70s", "80s", etc.
  colorVar: string;   // CSS variable name
  bgClass: string;    // Tailwind bg class with opacity
  textClass: string;  // Tailwind text class
  borderClass: string; // Tailwind border class
}

export function getEraInfo(year: number | null | undefined): EraInfo | null {
  if (!year) return null;

  const era = getEra(year);
  if (!era) return null;

  const label = getDecadeLabel(year);
  if (!label) return null;

  // Map era to Tailwind color classes
  const colorMap: Record<Era, { bg: string; text: string; border: string }> = {
    modern: { bg: 'bg-teal-500/20', text: 'text-teal-400', border: 'border-teal-500/30' },
    contemporary: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
    recent: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
    classic: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
    vintage: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' },
    golden: { bg: 'bg-yellow-600/20', text: 'text-yellow-500', border: 'border-yellow-600/30' },
  };

  const colors = colorMap[era];

  return {
    era,
    label,
    colorVar: getEraColorVar(era),
    bgClass: colors.bg,
    textClass: colors.text,
    borderClass: colors.border,
  };
}
