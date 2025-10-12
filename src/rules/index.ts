import { JsonType, RefMapRules } from "../types"
import { jsonSchemaRefMap } from "./jsonSchema"
import { asyncApi2RefMap, asyncApi3RefMap } from "./asyncapi"
import { openApiRefMap } from "./openapi"
import { swaggerRefMap } from "./swagger"

export const refMapRules: Record<JsonType, RefMapRules> = {
  OpenApi3: openApiRefMap,
  OpenApi2: swaggerRefMap,
  AsyncApi2: asyncApi2RefMap,
  AsyncApi3: asyncApi3RefMap,
  JsonSchema: jsonSchemaRefMap,
  unknown: {}
} as const
