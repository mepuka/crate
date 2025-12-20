/**
 * Generated Assets Module
 *
 * Provides access to AI-generated visual assets (liner notes, enhanced art, etc.)
 * stored in the knowledge base.
 */

export {
  AssetMetadata,
  AssetPlacement,
  AssetType,
  Era,
  GeneratedAsset,
  GeneratedAssetRow,
  StoreAssetInput,
  StoreAssetResponse,
  transformRowToAsset
} from "./schemas.js"

export { GeneratedAssetsError, GeneratedAssetsService } from "./service.js"
