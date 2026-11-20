import type { DefinitionPointer, RefMapRules } from "../types"
import { literalRule, schemaRefMap } from "./jsonSchema"

type OpenApiComponents =
  | "schemas"
  | "responses"
  | "parameters"
  | "examples"
  | "requestBodies"
  | "securitySchemes"
  | "headers"
  | "callbacks"
  | "links"

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
  "/*": {
    "#": openApiRefRule.examples,
    "/value": literalRule,
    "/dataValue": literalRule,
  },
}

const parametersRefMap: RefMapRules = {
  "/*": {
    "#": openApiRefRule.parameters,
    "/schema": schemaRefMap(openApiRefRule.schemas),
    "/examples": examplesRefMap,
  },
}
const headersRefMap: RefMapRules = {
  "/*": {
    "#": openApiRefRule.headers,
    "/schema": schemaRefMap(openApiRefRule.schemas),
    "/examples": examplesRefMap,
  },
}

const mediaTypesRefMap: RefMapRules = {
  "/*": {
    "/schema": schemaRefMap(openApiRefRule.schemas),
    "/examples": examplesRefMap,
    "/encoding": {
      "/headers": headersRefMap,
    },
  },
}

const requestBodyRefMap: RefMapRules = {
  "#": openApiRefRule.requestBodies,
  "/content": mediaTypesRefMap,
}

const callbacksRefMap: RefMapRules = {
  "/*": { "#": openApiRefRule.callbacks },
}

const linksRefMap: RefMapRules = {
  "/*": {
    "#": openApiRefRule.links,
    "/operationRef": { refs: "string" },
    "/parameters": literalRule,
    "/requestBody": literalRule,
  },
}

const responsesRefMap: RefMapRules = {
  "/*": {
    "#": openApiRefRule.responses,
    "/headers": headersRefMap,
    "/content": mediaTypesRefMap,
    "/links": linksRefMap,
  },
}

export const openApiRefMap: RefMapRules = {
  "/paths": {
    "/*": {
      "/*": {
        "/parameters": parametersRefMap,
        "/requestBody": requestBodyRefMap,
        "/responses": responsesRefMap,
        "/callbacks": callbacksRefMap,
      },
      "/parameters": parametersRefMap,
    },
  },
  "/components": {
    "/schemas": {
      "/*": schemaRefMap(openApiRefRule.schemas),
    },
    "/responses": responsesRefMap,
    "/parameters": parametersRefMap,
    "/examples": examplesRefMap,
    "/requestBodies": {
      "/*": requestBodyRefMap,
    },
    "/securitySchemes": {
      "/*": {
        "#": openApiRefRule.securitySchemes,
        "/flows": { "/*": { "/scopes": literalRule } },
      },
    },
    "/headers": headersRefMap,
    "/links": linksRefMap,
    "/callbacks": callbacksRefMap,
  },
}
