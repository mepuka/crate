/**
 * Art Components Module
 *
 * Album art display with derived ambient assets (glows, textures).
 * The album art itself is never altered - we add complementary effects.
 *
 * Usage:
 *   import { EnhancedAlbumArt, ParallaxAlbumArt } from "@/components/art";
 *
 *   // Display album art with derived ambient effects
 *   <EnhancedAlbumArt
 *     src={play.image_uri}
 *     alt={`${play.artist} - ${play.track}`}
 *     derivedStyle={play.derivedStyle}  // From backend ArtCurationService
 *     enableGlow={true}
 *     enableTexture={true}
 *   />
 */

// Core components
export { EnhancedAlbumArt, STYLE_METADATA } from "./EnhancedAlbumArt";
export type { EnhancementStyle } from "./EnhancedAlbumArt";

export { ParallaxAlbumArt } from "./ParallaxAlbumArt";

// Utilities (for backend pipeline)
export {
  STANDARD_SIZES,
  ENHANCEMENT_RESOLUTIONS,
  validateSourceImage,
  assertSourceImage,
} from "./artUtils";

export type { ArtAssetSizes, ImageDimensions } from "./artUtils";
