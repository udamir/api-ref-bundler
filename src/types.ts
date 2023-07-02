import { CrawlRules } from "json-crawl"

export type JsonType = "OpenApi3" | "OpenApi2" | "AsyncApi2" | "JsonSchema" | "unknown"

export type DefinitionPointer = `/${string}`
export type RefMapRule = { "#": DefinitionPointer }

export type RefMapRules = CrawlRules<RefMapRule>
