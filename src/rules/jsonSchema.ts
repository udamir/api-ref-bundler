import { DefinitionPointer, RefMapRules } from "../types";

export const schemaRefMap = (definitionPath: DefinitionPointer): RefMapRules => ({
  "#": definitionPath,
  "/not": () => schemaRefMap(definitionPath),
  "/allOf": {
    "/*": () => schemaRefMap(definitionPath),
  },
  "/oneOf": {
    "/*": () => schemaRefMap(definitionPath),
  },
  "/anyOf": {
    "/*": () => schemaRefMap(definitionPath),
  },
  "/items": () => ({
    ...schemaRefMap(definitionPath),
    "/*": () => schemaRefMap(definitionPath)
  }),
  "/properties": {
    "/*": () => schemaRefMap(definitionPath),
  },
  "/additionalProperties": () => schemaRefMap(definitionPath),
  "/definitions": {
    "/*": () => schemaRefMap(definitionPath)
  }
})

export const jsonSchemaRefMap: RefMapRules = schemaRefMap("/definitions")
