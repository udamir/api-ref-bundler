import { JsonType, RefMapRules } from "../types"
import { jsonSchemaRefMap } from "./jsonSchema"
import { asyncApiRefMap } from "./asyncapi"
import { openApiRefMap } from "./openapi"
import { swaggerRefMap } from "./swagger"

export const refMapRules: Record<JsonType, RefMapRules> = {
  OpenApi3: openApiRefMap,
  OpenApi2: swaggerRefMap,
  AsyncApi2: asyncApiRefMap,
  JsonSchema: jsonSchemaRefMap,
  unknown: {}
} as const
