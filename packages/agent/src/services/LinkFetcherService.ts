/**
 * LinkFetcherService
 *
 * Fetches web content via Jina AI Reader API and extracts MBIDs from markdown.
 * Returns clean markdown content suitable for LLM consumption.
 *
 * @module
 */

import { Context, Effect, Layer, Schema, Redacted } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import { JinaConfig } from "../config.js";
import { LinkFetchError } from "./errors.js";
import { getLinkType } from "../link-types.js";
import type {
  FetchLinkParams,
  FetchLinkResponse,
  ExtractedLink,
} from "../tools/schemas.js";

// =============================================================================
// Service Interface
// =============================================================================

/**
 * LinkFetcherService interface
 */
export interface LinkFetcherServiceInterface {
  /**
   * Fetch web content via Jina AI Reader
   *
   * @param params - URL and options for fetching
   * @returns Markdown content with metadata
   */
  readonly fetch: (
    params: FetchLinkParams
  ) => Effect.Effect<FetchLinkResponse, LinkFetchError>;

  /**
   * Extract MusicBrainz IDs from markdown content
   *
   * @param markdown - Markdown content to scan
   * @returns Array of extracted MBIDs (UUIDs)
   */
  readonly extractMbids: (
    markdown: string
  ) => Effect.Effect<ReadonlyArray<string>>;
}

// =============================================================================
// Service Tag
// =============================================================================

/**
 * LinkFetcherService - fetch web content via Jina AI Reader
 */
export class LinkFetcherService extends Context.Tag("LinkFetcherService")<
  LinkFetcherService,
  LinkFetcherServiceInterface
>() {}

// =============================================================================
// Jina API Response Schema
// =============================================================================

/**
 * Jina Reader API response
 */
const JinaReaderResponse = Schema.Struct({
  code: Schema.Number,
  status: Schema.Number,
  data: Schema.Struct({
    title: Schema.String,
    description: Schema.optional(Schema.String),
    url: Schema.String,
    content: Schema.String,
    links: Schema.optional(
      Schema.Record({
        key: Schema.String,
        value: Schema.String,
      })
    ),
  }),
});

// =============================================================================
// Constants
// =============================================================================

/**
 * Regex pattern for MusicBrainz URLs
 * Matches: musicbrainz.org/{entity-type}/{uuid}
 */
const MUSICBRAINZ_URL_PATTERN =
  /musicbrainz\.org\/(?:artist|recording|release|release-group|label|work|area|place|event|series|instrument|url)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

/**
 * Regex pattern for standalone MBIDs (UUID format)
 */
const MBID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Regex pattern for extracting markdown links
 */
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract links from markdown content
 */
const extractLinksFromMarkdown = (
  markdown: string,
  extractLinks: boolean
): ReadonlyArray<ExtractedLink> => {
  if (!extractLinks) {
    return [];
  }

  const links: ExtractedLink[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex for global regex
  MARKDOWN_LINK_PATTERN.lastIndex = 0;

  while ((match = MARKDOWN_LINK_PATTERN.exec(markdown)) !== null) {
    const text = match[1];
    const url = match[2];

    // Classify link type using centralized config
    const type = getLinkType(url);

    links.push({
      url,
      text,
      type,
    });
  }

  return links;
};

/**
 * Count words in markdown content (approximate)
 */
const countWords = (markdown: string): number => {
  // Remove markdown syntax for cleaner count
  const text = markdown
    .replace(/#+\s/g, "") // Remove headers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Keep link text
    .replace(/[*_`~]/g, "") // Remove emphasis
    .replace(/\n+/g, " ") // Normalize whitespace
    .trim();

  if (text.length === 0) return 0;
  return text.split(/\s+/).length;
};

/**
 * Extract title from markdown content if not provided
 */
const extractTitleFromMarkdown = (markdown: string): string => {
  // Look for first H1
  const h1Match = markdown.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();

  // Look for first H2
  const h2Match = markdown.match(/^##\s+(.+)$/m);
  if (h2Match) return h2Match[1].trim();

  // Use first line if short enough
  const firstLine = markdown.split("\n")[0]?.trim() ?? "";
  if (firstLine.length > 0 && firstLine.length < 100) {
    return firstLine;
  }

  return "Untitled";
};

// =============================================================================
// Service Implementation
// =============================================================================

/**
 * Create the LinkFetcherService implementation
 */
const makeLinkFetcherService = Effect.gen(function* () {
  const config = yield* JinaConfig;

  // Configure HTTP client for Jina API
  // Jina expects: GET https://r.jina.ai/{url}
  // See: https://github.com/jina-ai/reader for header options
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest(HttpClientRequest.prependUrl(config.baseUrl)),
    HttpClient.mapRequest(HttpClientRequest.acceptJson),
    // Optimization headers to reduce content size
    HttpClient.mapRequest(
      HttpClientRequest.setHeaders({
        // Remove images - we only need text content for LLM analysis
        "x-no-images": "true",
        // Remove common noise elements (nav, footer, ads, sidebars)
        "x-remove-selector": "nav, footer, aside, .advertisement, .ad, [class*='ad-'], .sidebar, .comments",
      })
    ),
    // Add API key if available
    HttpClient.mapRequest((request) => {
      if (config.apiKey) {
        return HttpClientRequest.setHeader(
          "Authorization",
          `Bearer ${Redacted.value(config.apiKey)}`
        )(request);
      }
      return request;
    })
  );

  /**
   * Fetch web content via Jina AI Reader
   */
  const fetch = (
    params: FetchLinkParams
  ): Effect.Effect<FetchLinkResponse, LinkFetchError> =>
    Effect.gen(function* () {
      // Jina Reader API: GET https://r.jina.ai/{target-url}
      // The URL is appended directly after the base URL
      const targetUrl = params.url;

      const response = yield* client.get(`/${targetUrl}`).pipe(
        Effect.timeout(config.timeout),
        Effect.mapError(
          (error) =>
            new LinkFetchError({
              message: `Jina Reader fetch failed: ${error}`,
              url: params.url,
              cause: error,
            })
        )
      );

      // Parse Jina response
      const jinaData = yield* HttpClientResponse.schemaBodyJson(
        JinaReaderResponse
      )(response).pipe(
        Effect.mapError(
          (error) =>
            new LinkFetchError({
              message: `Failed to parse Jina Reader response: ${error}`,
              url: params.url,
              cause: error,
            })
        )
      );

      // Check for API errors
      if (jinaData.code !== 200) {
        return yield* Effect.fail(
          new LinkFetchError({
            message: `Jina Reader API error: status ${jinaData.status}`,
            url: params.url,
          })
        );
      }

      const content = jinaData.data.content;
      const title = jinaData.data.title || extractTitleFromMarkdown(content);

      // Extract links if requested
      const links = extractLinksFromMarkdown(
        content,
        params.extract_links ?? false
      );

      return {
        url: jinaData.data.url,
        title,
        content,
        word_count: countWords(content),
        links: links as ExtractedLink[],
      };
    });

  /**
   * Extract MusicBrainz IDs from markdown content
   */
  const extractMbids = (
    markdown: string
  ): Effect.Effect<ReadonlyArray<string>> =>
    Effect.sync(() => {
      const mbids = new Set<string>();

      // First, extract MBIDs from MusicBrainz URLs
      MUSICBRAINZ_URL_PATTERN.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = MUSICBRAINZ_URL_PATTERN.exec(markdown)) !== null) {
        mbids.add(match[1].toLowerCase());
      }

      // Also find standalone MBIDs that look like UUIDs
      // But only if they're in a MusicBrainz context
      // (to avoid false positives from other UUIDs)
      MBID_PATTERN.lastIndex = 0;
      while ((match = MBID_PATTERN.exec(markdown)) !== null) {
        const mbid = match[0].toLowerCase();
        // Check if this UUID is near "musicbrainz" or "mbid" text
        const contextStart = Math.max(0, match.index - 50);
        const contextEnd = Math.min(
          markdown.length,
          match.index + match[0].length + 20
        );
        const context = markdown.slice(contextStart, contextEnd).toLowerCase();
        if (context.includes("musicbrainz") || context.includes("mbid")) {
          mbids.add(mbid);
        }
      }

      return Array.from(mbids);
    });

  return {
    fetch,
    extractMbids,
  } satisfies LinkFetcherServiceInterface;
});

// =============================================================================
// Layers
// =============================================================================

/**
 * Live layer for LinkFetcherService
 * Requires JinaConfig and HttpClient
 */
export const LinkFetcherServiceLive: Layer.Layer<
  LinkFetcherService,
  never,
  JinaConfig | HttpClient.HttpClient
> = Layer.effect(LinkFetcherService, makeLinkFetcherService);

/**
 * Fully composed layer with all dependencies
 */
export const LinkFetcherServiceFull = LinkFetcherServiceLive.pipe(
  Layer.provide(JinaConfig.Default),
  Layer.provide(FetchHttpClient.layer)
);

/**
 * Test layer with mock implementation
 */
export const LinkFetcherServiceTest: Layer.Layer<LinkFetcherService> =
  Layer.succeed(LinkFetcherService, {
    fetch: (params) =>
      Effect.succeed({
        url: params.url,
        title: "Mock Page Title",
        content: "# Mock Content\n\nThis is mock markdown content for testing.",
        word_count: 8,
        links: params.extract_links
          ? [
              {
                url: "https://musicbrainz.org/artist/abc-123",
                text: "Artist Page",
                type: "musicbrainz",
              },
              { url: "https://example.com", text: "Example", type: undefined },
            ]
          : [],
      }),
    extractMbids: (markdown) =>
      Effect.sync(() => {
        const mbids: string[] = [];
        MUSICBRAINZ_URL_PATTERN.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = MUSICBRAINZ_URL_PATTERN.exec(markdown)) !== null) {
          mbids.push(match[1].toLowerCase());
        }
        return mbids;
      }),
  } satisfies LinkFetcherServiceInterface);

/**
 * Create a test layer with custom mock responses
 */
export const makeLinkFetcherServiceTestWithData = (
  responses: Record<string, FetchLinkResponse>
): Layer.Layer<LinkFetcherService> =>
  Layer.succeed(LinkFetcherService, {
    fetch: (params) => {
      const response = responses[params.url];
      if (response) {
        return Effect.succeed(response);
      }
      return Effect.fail(
        new LinkFetchError({
          message: `No mock response for URL: ${params.url}`,
          url: params.url,
        })
      );
    },
    extractMbids: (markdown) =>
      Effect.sync(() => {
        const mbids: string[] = [];
        MUSICBRAINZ_URL_PATTERN.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = MUSICBRAINZ_URL_PATTERN.exec(markdown)) !== null) {
          mbids.push(match[1].toLowerCase());
        }
        return mbids;
      }),
  } satisfies LinkFetcherServiceInterface);
