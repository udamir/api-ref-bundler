import type { CrawlRules } from "json-crawl"

export type JsonPrimitive = string | number | boolean | null
export type JsonObject = { [key: string]: JsonNode | undefined }
export type JsonNode = JsonPrimitive | JsonNode[] | JsonObject

export type JsonType =
  | "OpenApi3"
  | "OpenApi2"
  | "AsyncApi2"
  | "AsyncApi3"
  | "JsonSchema"
  | "unknown"

export type DefinitionPointer = `/${string}`

/**
 * Rule attached to a location of the rule tree:
 * - `"#"`     container (pointer in the root document) where external targets referenced
 *             from this location are hoisted by `bundle`; without it targets are inlined
 * - `refs`    `"string"` marks a location whose *string value* is a reference
 *             (`discriminator.mapping/*`, `links/*\/operationRef`)
 * - `literal` the value is data (`example`, `default`, `enum`, Example `value`, …): a `$ref`
 *             member inside it is neither resolved nor reported
 */
export type RefMapRule = {
  "#"?: DefinitionPointer
  refs?: "string"
  literal?: true
}

export type RefMapRules = CrawlRules<RefMapRule>

/** The bundled document (kept untyped for callers, as `bundle` always returned `any`). */
export type BundledDocument = any
