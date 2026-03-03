import { HttpApiBuilder, HttpApiSwagger, HttpMiddleware } from "@effect/platform"
import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { ConfigProvider, Layer } from "effect"
import * as API from "./api/index.js"

const ApiLive = API.LayerAPI
const HttpServerLive = BunHttpServer.layer({ port: 3000 })

const ServeLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(ApiLive),
  Layer.provide(HttpServerLive)
)

const SwaggerLive = HttpApiSwagger.layer().pipe(
  Layer.provide(ApiLive)
)

const HttpLive = Layer.mergeAll(
  Layer.setConfigProvider(ConfigProvider.fromEnv()),
  ServeLive,
  SwaggerLive
).pipe(
  Layer.provide(Layer.scope)
)

BunRuntime.runMain(Layer.launch(HttpLive))
