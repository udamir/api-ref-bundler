import { schemaRefMap } from "./jsonSchema"
import { DefinitionPointer, RefMapRules } from "../types"

type SwaggerComponents = "definitions" | "responses" | "parameters"

const swaggerRefRule: Record<SwaggerComponents, DefinitionPointer> = {
  definitions: "/definitions",
  responses: "/responses",
  parameters: "/parameters"
} as const

const parametersRefMap: RefMapRules = {
  "/*": {
    ...schemaRefMap(swaggerRefRule.definitions),
    "#": swaggerRefRule.parameters,
    "/schema": schemaRefMap(swaggerRefRule.definitions),
  }
}

const responsesRefMap: RefMapRules = {
  "/*": {
    "#": swaggerRefRule.responses,
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
