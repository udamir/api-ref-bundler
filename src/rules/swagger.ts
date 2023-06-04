import { schemaRefMap } from "./jsonSchema"
import { RefMapRule, RefMapRules } from "../types"

type SwaggerComponents = "definitions" | "responses" | "parameters"

const swaggerRefRule: Record<SwaggerComponents, RefMapRule> = {
  definitions: "#/definitions",
  responses: "#/responses",
  parameters: "#/parameters"
} as const

const parametersRefMap: RefMapRules = {
  "/*": {
    "/": swaggerRefRule.parameters,
    "/schema": schemaRefMap(swaggerRefRule.definitions),
    ...schemaRefMap(swaggerRefRule.definitions)
  }
}

const responsesRefMap: RefMapRules = {
  "/*": {
    "/": swaggerRefRule.responses,
    "/*": {
      "/schema": schemaRefMap(swaggerRefRule.definitions),
      "/headers": parametersRefMap
    }
  }
}

export const swaggerRefMap: RefMapRules = {
  "/paths": {
    "/*": {
      "/*": {
        "/parameters": parametersRefMap,
        "/responses": responsesRefMap,
      },
      "/parameters": parametersRefMap,
    },
  },
  "/definitions": {
    "/*": schemaRefMap(swaggerRefRule.definitions),
  },
  "/responses": responsesRefMap,
  "/parameters": parametersRefMap,
}
