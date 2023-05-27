export type JsonType = "OpenApi3" | "OpenApi2" | "AsyncApi2" | "JsonSchema" | "unknown"

export type ObjPath = (string | number)[]

export type RefMapRule = `#/${string}`

export type RefMapRulesFunc = () => RefMapRules

export type RefMapRules = {
  [key: `/${string}`]: RefMapRule | RefMapRules | RefMapRulesFunc
} & {
  "/"?: RefMapRule
}
