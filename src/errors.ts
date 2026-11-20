import type { JsonPath } from "json-crawl"

/**
 * Typed reference errors.
 *
 * - `missing`              the referenced document or pointer does not exist
 * - `error`                the user resolver threw (or returned nothing) for a document
 * - `invalid-pointer`      the fragment is not a valid RFC 6901 pointer (bad `%xx`, no leading `/`, bad array index)
 * - `cycle-without-content` a pure `$ref` → `$ref` loop with no content at any hop
 * - `not-allowed`          reserved for rule-driven "reference not allowed here" diagnostics
 */
export type RefErrorType =
  | "missing"
  | "error"
  | "invalid-pointer"
  | "cycle-without-content"
  | "not-allowed"

export interface RefErrorDetail {
  type: RefErrorType
  ref: string // normalized reference as written by the author (file part relative to the base)
  document: string // document id of the referenced document
  tokens: string[] // decoded pointer tokens (empty for the whole document)
  cause?: unknown // original exception, when the resolver threw
  members?: string[] // cycle-without-content: canonical keys of the references on the loop
}

export const refErrorMessage = (detail: RefErrorDetail): string => {
  switch (detail.type) {
    case "cycle-without-content":
      return `Cycle without content: ${detail.ref}`
    default:
      return `Cannot resolve: ${detail.ref}`
  }
}

/** Error thrown for base-document failures (`bundle`/`dereference` reject with it). */
export class RefResolveError extends Error {
  public readonly detail: RefErrorDetail
  constructor(detail: RefErrorDetail) {
    super(refErrorMessage(detail))
    this.name = "RefResolveError"
    this.detail = detail
  }
}

export type SourceLocation = { document: string; tokens: string[] }
export type SourceMap = Map<string, SourceLocation> // output pointer → source location

export const pathToTokens = (path: JsonPath): string[] => path.map(String)
