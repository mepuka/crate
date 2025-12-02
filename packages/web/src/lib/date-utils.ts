/**
 * Date Formatting Utilities
 *
 * Provides composable date formatting functions with localization support
 * using Effect's DateTime module for timezone-aware operations.
 *
 * All functions are pure and use Effect's native DateTime types for
 * immutable, type-safe date operations.
 */

// Effect imports
import { DateTime } from "effect";

// Third-party imports
import { formatDistanceToNow } from "date-fns";

/**
 * Constants
 */

/**
 * Default locale fallback when browser locale is not available or not supported.
 */
const DEFAULT_LOCALE = "en-US";

/**
 * Helper Functions
 */

/**
 * Get the default locale from the browser, falling back to DEFAULT_LOCALE.
 * Returns the user's preferred locale or the fallback.
 */
const getDefaultLocale = (): string => {
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }
  return DEFAULT_LOCALE;
};

/**
 * Convert a JavaScript Date to Effect's DateTime.Utc.
 * This is a pure conversion that treats the Date as UTC.
 */
const dateToDateTime = (date: Date): DateTime.Utc =>
  DateTime.unsafeFromDate(date);

/**
 * Core Localized Formatting Functions
 *
 * Pure functions that format dates using Effect's DateTime formatting API.
 * All functions accept Date objects (for compatibility with Play schema)
 * and internally convert to DateTime for formatting.
 */

/**
 * Format a date with locale-aware formatting using Effect's DateTime.
 *
 * @param date - The date to format (JavaScript Date)
 * @param locale - Optional locale string (defaults to browser locale or 'en-US')
 * @param options - Optional Intl.DateTimeFormatOptions for custom formatting
 * @returns Formatted date string
 *
 * @example
 * ```ts
 * formatDateLocal(new Date('2024-01-15')) // "1/15/2024" (en-US) or "15/1/2024" (en-GB)
 * formatDateLocal(new Date('2024-01-15'), 'en-US', { month: 'long', day: 'numeric', year: 'numeric' }) // "January 15, 2024"
 * ```
 */
export const formatDateLocal = (
  date: Date,
  locale?: string,
  options?: Intl.DateTimeFormatOptions
): string => {
  const effectiveLocale = locale ?? getDefaultLocale();
  const dateTime = dateToDateTime(date);
  return DateTime.format(dateTime, {
    locale: effectiveLocale,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    ...options,
  });
};

/**
 * Format a time with locale-aware formatting using Effect's DateTime.
 *
 * @param date - The date to format (JavaScript Date)
 * @param locale - Optional locale string (defaults to browser locale or 'en-US')
 * @param options - Optional Intl.DateTimeFormatOptions for custom formatting
 * @returns Formatted time string
 *
 * @example
 * ```ts
 * formatTimeLocal(new Date('2024-01-15T15:30:00')) // "3:30 PM" (en-US) or "15:30" (en-GB)
 * ```
 */
export const formatTimeLocal = (
  date: Date,
  locale?: string,
  options?: Intl.DateTimeFormatOptions
): string => {
  const effectiveLocale = locale ?? getDefaultLocale();
  const dateTime = dateToDateTime(date);
  return DateTime.formatLocal(dateTime, {
    locale: effectiveLocale,
    hour: "numeric",
    minute: "2-digit",
    ...options,
  });
};

/**
 * Format a date and time with locale-aware formatting using Effect's DateTime.
 *
 * @param date - The date to format (JavaScript Date)
 * @param locale - Optional locale string (defaults to browser locale or 'en-US')
 * @param options - Optional Intl.DateTimeFormatOptions for custom formatting
 * @returns Formatted date and time string
 *
 * @example
 * ```ts
 * formatDateTimeLocal(new Date('2024-01-15T15:30:00')) // "1/15/2024, 3:30 PM" (en-US)
 * ```
 */
export const formatDateTimeLocal = (
  date: Date,
  locale?: string,
  options?: Intl.DateTimeFormatOptions
): string => {
  const effectiveLocale = locale ?? getDefaultLocale();
  const dateTime = dateToDateTime(date);
  return DateTime.formatLocal(dateTime, {
    locale: effectiveLocale,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...options,
  });
};

/**
 * Format a date as relative time (e.g., "2 hours ago", "3 days ago").
 * Uses date-fns formatDistanceToNow for consistent relative formatting.
 *
 * @param date - The date to format (JavaScript Date)
 * @param locale - Optional locale string for date-fns (defaults to browser locale or 'en-US')
 * @returns Relative time string
 *
 * @example
 * ```ts
 * formatRelativeTime(new Date(Date.now() - 2 * 60 * 60 * 1000)) // "2 hours ago"
 * ```
 */
export const formatRelativeTime = (date: Date, _locale?: string): string => {
  // date-fns formatDistanceToNow accepts locale as second parameter
  // We need to import the locale from date-fns/locale if needed
  // For now, use the default English formatting
  return formatDistanceToNow(date, { addSuffix: true });
};

/**
 * Preset Formatters
 *
 * Convenience functions for common date formatting use cases in the application.
 * These use Effect's DateTime formatting API internally.
 */

/**
 * Format time for play cards (12-hour format with AM/PM).
 * Uses Effect's DateTime.formatLocal for timezone-aware formatting.
 *
 * @param date - The date to format (JavaScript Date)
 * @param locale - Optional locale string (defaults to browser locale or 'en-US')
 * @returns Formatted time string (e.g., "3:45 PM")
 *
 * @example
 * ```ts
 * formatPlayTime(new Date('2024-01-15T15:45:00')) // "3:45 PM"
 * ```
 */
export const formatPlayTime = (date: Date, locale?: string): string => {
  const effectiveLocale = locale ?? getDefaultLocale();
  const dateTime = dateToDateTime(date);
  return DateTime.formatLocal(dateTime, {
    locale: effectiveLocale,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

/**
 * Format time for timeline display with semantic awareness.
 * Shows contextual time based on how old the play is:
 * - < 1 hour: relative time ("5 min ago", "45 min ago")
 * - Same day: time only ("3:45 PM")
 * - Yesterday: "Yesterday, 3:45 PM"
 * - This week: day + time ("Mon, 3:45 PM")
 * - This year: month + day ("Jan 15")
 * - Older: full date ("Jan 15, 2023")
 *
 * @param date - The date to format (JavaScript Date)
 * @param locale - Optional locale string (defaults to browser locale or 'en-US')
 * @returns Semantically appropriate time string
 */
export const formatSemanticTime = (date: Date, locale?: string): string => {
  const effectiveLocale = locale ?? getDefaultLocale();
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffDays = Math.floor(diffMs / 86400000);

  // Less than 1 hour ago - show relative
  if (diffMinutes < 60) {
    if (diffMinutes < 1) return "Just now";
    return `${diffMinutes}m ago`;
  }

  // Less than 24 hours ago but check if same calendar day
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    // Today - show time only
    const dateTime = dateToDateTime(date);
    return DateTime.formatLocal(dateTime, {
      locale: effectiveLocale,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  // Check if yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    const dateTime = dateToDateTime(date);
    const time = DateTime.formatLocal(dateTime, {
      locale: effectiveLocale,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `Yesterday, ${time}`;
  }

  // Within last 7 days - show weekday + time
  if (diffDays < 7) {
    const dateTime = dateToDateTime(date);
    return DateTime.formatLocal(dateTime, {
      locale: effectiveLocale,
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  // Same year - show month + day
  if (date.getFullYear() === now.getFullYear()) {
    const dateTime = dateToDateTime(date);
    return DateTime.formatLocal(dateTime, {
      locale: effectiveLocale,
      month: "short",
      day: "numeric",
    });
  }

  // Older - show month, day, year
  const dateTime = dateToDateTime(date);
  return DateTime.formatLocal(dateTime, {
    locale: effectiveLocale,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

/**
 * Format date for date dividers (full month name, day, year).
 * Uses Effect's DateTime.formatLocal for timezone-aware formatting.
 *
 * @param date - The date to format (JavaScript Date)
 * @param locale - Optional locale string (defaults to browser locale or 'en-US')
 * @returns Formatted date string (e.g., "January 15, 2024")
 *
 * @example
 * ```ts
 * formatPlayDate(new Date('2024-01-15')) // "January 15, 2024"
 * ```
 */
export const formatPlayDate = (date: Date, locale?: string): string => {
  const effectiveLocale = locale ?? getDefaultLocale();
  const dateTime = dateToDateTime(date);
  return DateTime.formatLocal(dateTime, {
    locale: effectiveLocale,
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

/**
 * Format short date for compact displays (abbreviated month, day).
 * Uses Effect's DateTime.formatLocal for timezone-aware formatting.
 *
 * @param date - The date to format (JavaScript Date)
 * @param locale - Optional locale string (defaults to browser locale or 'en-US')
 * @returns Formatted date string (e.g., "Jan 15")
 *
 * @example
 * ```ts
 * formatPlayDateShort(new Date('2024-01-15')) // "Jan 15"
 * ```
 */
export const formatPlayDateShort = (date: Date, locale?: string): string => {
  const effectiveLocale = locale ?? getDefaultLocale();
  const dateTime = dateToDateTime(date);
  return DateTime.formatLocal(dateTime, {
    locale: effectiveLocale,
    month: "short",
    day: "numeric",
  });
};

/**
 * Format full date and time for detailed views.
 * Uses Effect's DateTime.formatLocal for timezone-aware formatting.
 *
 * @param date - The date to format (JavaScript Date)
 * @param locale - Optional locale string (defaults to browser locale or 'en-US')
 * @returns Formatted date and time string (e.g., "January 15, 2024, 3:45 PM")
 *
 * @example
 * ```ts
 * formatPlayDateTime(new Date('2024-01-15T15:45:00')) // "January 15, 2024, 3:45 PM"
 * ```
 */
export const formatPlayDateTime = (date: Date, locale?: string): string => {
  const effectiveLocale = locale ?? getDefaultLocale();
  const dateTime = dateToDateTime(date);
  return DateTime.formatLocal(dateTime, {
    locale: effectiveLocale,
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

/**
 * Timezone Utilities
 *
 * Pure functions for timezone-aware date operations using Effect's DateTime.TimeZone.
 */

/**
 * Format a date with a specific timezone using Effect's DateTime.
 * Creates a Zoned DateTime with the specified timezone and formats it.
 *
 * @param date - The date to format (JavaScript Date)
 * @param timezone - IANA timezone identifier (e.g., 'America/New_York', 'Europe/London')
 * @param locale - Optional locale string (defaults to browser locale or 'en-US')
 * @returns Formatted date string
 *
 * @example
 * ```ts
 * const formatted = formatWithTimezone(
 *   new Date('2024-01-15T12:00:00Z'),
 *   'America/New_York'
 * )
 * ```
 */
export const formatWithTimezone = (
  date: Date,
  timezone: string,
  locale?: string
): string => {
  const effectiveLocale = locale ?? getDefaultLocale();
  const dateTime = dateToDateTime(date);

  // Create a named timezone
  const timeZone = DateTime.zoneUnsafeMakeNamed(timezone);

  // Apply timezone to DateTime
  const zoned = DateTime.setZone(dateTime, timeZone);

  // Format with the specified locale
  return DateTime.format(zoned, {
    locale: effectiveLocale,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

/**
 * Get the system's local timezone as an Effect DateTime.TimeZone.
 * Returns a TimeZone.Named representing the system's local timezone.
 *
 * @returns TimeZone.Named for the system's local timezone
 *
 * @example
 * ```ts
 * const localZone = getLocalTimeZone()
 * const zoned = DateTime.setZone(dateTime, localZone)
 * ```
 */
export const getLocalTimeZone = (): DateTime.TimeZone.Named =>
  DateTime.zoneMakeLocal();
