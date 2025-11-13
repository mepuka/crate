import { HttpApiEndpoint, HttpApiGroup, HttpApiError } from "@effect/platform"
import { HealthResponse } from "../schemas/Health.js"

/**
 * Health API Endpoints
 *
 * GET /api/health - Health check and service status
 */

export const HealthApi = HttpApiGroup.make("health")
  .add(
    HttpApiEndpoint.get("check", "/health")
      .addSuccess(HealthResponse)
      .addError(HttpApiError.InternalServerError)
  )
  .prefix("/api")
