import { DefinitionPointer, RefMapRules } from "../types"
import { schemaRefMap } from "./jsonSchema"

type OpenApiComponents = "schemas" | "responses" | "parameters" | "examples" | "requestBodies" | "securitySchemes" | "headers" | "callbacks" | "links"

const openApiRefRule: Record<OpenApiComponents, DefinitionPointer> = {
  schemas: "/components/schemas",
  responses: "/components/responses",
  parameters: "/components/parameters",
  examples: "/components/examples",
  requestBodies: "/components/requestBodies",
  securitySchemes: "/components/securitySchemes",
  headers: "/components/headers",
  links: "/components/links",
  callbacks: "/components/callbacks",
} as const

const examplesRefMap: RefMapRules = {
   "/*": { "#": openApiRefRule.examples },
}

const parametersRefMap: RefMapRules = {
  "/*": {
    "#": openApiRefRule.parameters,
    "/schema": schemaRefMap(openApiRefRule.schemas),
    "/example": { "#": openApiRefRule.examples },
    "/examples": examplesRefMap
  }
}
const headersRefMap: RefMapRules = {
  "/*": {
    "#": openApiRefRule.headers,
    "/schema": schemaRefMap(openApiRefRule.schemas),
    "/example": { "#": openApiRefRule.examples },
    "/examples": examplesRefMap
  }
}

const mediaTypesRefMap: RefMapRules = {
  "/*": {
    "/schema": schemaRefMap(openApiRefRule.schemas),
    "/example": { "#": openApiRefRule.examples },
    "/examples": examplesRefMap,
    "/encoding": {
      "/headers": headersRefMap
    }
  }
}

const requestBodyRefMap: RefMapRules = {
  "#": openApiRefRule.requestBodies,
  "/content": mediaTypesRefMap
}

const callbacksRefMap: RefMapRules = {
  "/*": { "#": openApiRefRule.callbacks }
}

const linksRefMap: RefMapRules = {
  "/*": { "#": openApiRefRule.links }
}

const responsesRefMap: RefMapRules = {
  "/*": {
    "#": openApiRefRule.responses,
    "/headers": headersRefMap,
    "/content": mediaTypesRefMap,
    "/links": linksRefMap
  }
}

export const openApiRefMap: RefMapRules = {
  "/paths": {
    "/*": {
      "/*": {
        "/parameters": parametersRefMap,
        "/requestBody": requestBodyRefMap,
        "/responses": responsesRefMap,
        "/callbacks": callbacksRefMap
      },
      "/parameters": parametersRefMap,
    },
  },
  "/components": {
    "/schemas": {
      "/*": schemaRefMap(openApiRefRule.schemas)
    },
    "/responses": responsesRefMap,
    "/parameters": parametersRefMap,
    "/examples": examplesRefMap,
    "/requestBodies": {
      "/*": requestBodyRefMap
    },
    "/securitySchemes": {
      "/*": { "#": openApiRefRule.securitySchemes },
    },
    "/headers": headersRefMap,
    "/links": linksRefMap,
    "/callbacks": callbacksRefMap,
  }
}
