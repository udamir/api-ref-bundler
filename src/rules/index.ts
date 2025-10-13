import { JsonType, RefMapRules } from "../types"
import { jsonSchemaRefMap } from "./jsonSchema"
import { asyncApiRefMap } from "./asyncapi"
import { asyncApi3RefMap } from "./asyncapi3"
import { openApiRefMap } from "./openapi"
import { swaggerRefMap } from "./swagger"

export const refMapRules: Record<JsonType, RefMapRules> = {
  OpenApi3: openApiRefMap,
  OpenApi2: swaggerRefMap,
  AsyncApi2: asyncApiRefMap,
  AsyncApi3: asyncApi3RefMap,
  JsonSchema: jsonSchemaRefMap,
  unknown: {}
} as const
