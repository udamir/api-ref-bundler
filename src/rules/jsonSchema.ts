import type { DefinitionPointer, RefMapRules } from "../types"

/** A location whose value is data, not a document part (see `RefMapRule.literal`). */
export const literalRule: RefMapRules = { literal: true }

const cache = new Map<DefinitionPointer, RefMapRules>()

/**
 * JSON Schema reference rules for a given definition container.
 * Memoised per container so the rule tree is a finite graph of shared objects
 * (json-crawl evaluates rule functions for every node).
 */
export const schemaRefMap = (
  definitionPath: DefinitionPointer,
): RefMapRules => {
  const cached = cache.get(definitionPath)
  if (cached) {
    return cached
  }
  const self = () => schemaRefMap(definitionPath)
  const rules: RefMapRules = {
    "#": definitionPath,
    "/not": self,
    "/allOf": { "/*": self },
    "/oneOf": { "/*": self },
    "/anyOf": { "/*": self },
    "/items": () => ({ ...schemaRefMap(definitionPath), "/*": self }),
    "/properties": { "/*": self },
    "/additionalProperties": self,
    "/definitions": { "/*": self },
    "/$defs": { "/*": self },
    "/discriminator": {
      "/mapping": { "/*": { refs: "string", "#": definitionPath } },
    },
    // `enum`/`const` values take part in validation; annotations (`default`, `example(s)`) are resolved
    "/const": literalRule,
    "/enum": literalRule,
  }
  cache.set(definitionPath, rules)
  return rules
}

export const jsonSchemaRefMap: RefMapRules = schemaRefMap("/definitions")
export const jsonSchemaDefsRefMap: RefMapRules = schemaRefMap("/$defs")
