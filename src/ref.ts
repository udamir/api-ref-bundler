import { normalize } from "./normalize"

/**
 * Reference model.
 *
 * A reference is `{ document, tokens }`:
 * - `document` is a canonical document id: the WHATWG `URL` href when the base or the
 *   reference carries a scheme (RFC 3986 §5.2 resolution), otherwise a posix-normalised
 *   path resolved against the directory of the base (absolute-path references replace
 *   the base path, `..` above the root is preserved for file-system resolvers).
 * - `tokens` are RFC 6901 pointer tokens (percent-decoded first, then `~1` → `/`, `~0` → `~`).
 */

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/
const WINDOWS_DRIVE = /^[a-zA-Z]:[\\/]/
const ARRAY_INDEX = /^(0|[1-9][0-9]*)$/
const ESCAPED_SLASH = /~1/g
const ESCAPED_TILDE = /~0/g
const INVALID_ESCAPE = /~(?![01])/
const TILDE = /~/g
const SLASH = /\//g

export const hasScheme = (str: string): boolean =>
  SCHEME.test(str) && !WINDOWS_DRIVE.test(str)

const toUrl = (str: string, base?: string): string | undefined => {
  try {
    return new URL(str, base).href
  } catch {
    return undefined
  }
}

/** Posix join of a reference path against the directory of the base path. */
export const relativePath = (path: string, basePath?: string): string => {
  if (!basePath) {
    return normalize(path)
  } else if (!path) {
    return normalize(basePath)
  } else if (path.charCodeAt(0) === 47 /* "/" */) {
    // absolute-path reference replaces the whole base path (RFC 3986 §5.2.2)
    return normalize(path)
  } else {
    const base = basePath.split("/")
    base[base.length - 1] = path
    return normalize(base.join("/"))
  }
}

/** Canonical id of the document `filePart` refers to, resolved against `base`. */
export const resolveDocumentId = (filePart: string, base: string): string => {
  if (!filePart) {
    return base
  }
  if (hasScheme(filePart)) {
    return toUrl(filePart) ?? filePart
  }
  if (hasScheme(base)) {
    return toUrl(filePart, base) ?? filePart
  }
  return relativePath(filePart, base)
}

/** Canonical id of an entry document path or URL. */
export const normalizeDocumentId = (path: string): string => {
  if (!path) {
    return path
  }
  return hasScheme(path) ? (toUrl(path) ?? path) : normalize(path)
}

/**
 * Strict RFC 6901 parser: returns the decoded tokens or `undefined` when the pointer
 * is not valid (does not start with `/`, malformed percent-encoding).
 */
export const parseTokens = (pointer: string): string[] | undefined => {
  if (pointer === "") {
    return []
  }
  if (pointer.charCodeAt(0) !== 47 /* "/" */) {
    return undefined
  }
  const parts = pointer.split("/")
  // oxlint-disable-next-line unicorn/no-new-array -- preallocated, filled below
  const tokens: string[] = new Array(parts.length - 1)
  for (let i = 1; i < parts.length; i++) {
    let token = parts[i]
    if (token.indexOf("%") !== -1) {
      try {
        token = decodeURIComponent(token)
      } catch {
        return undefined
      }
    }
    if (token.indexOf("~") !== -1) {
      if (INVALID_ESCAPE.test(token)) {
        return undefined // RFC 6901: escaped = "~" ( "0" / "1" )
      }
      token = token.replace(ESCAPED_SLASH, "/").replace(ESCAPED_TILDE, "~")
    }
    tokens[i - 1] = token
  }
  return tokens
}

export const isArrayIndex = (token: string): boolean => ARRAY_INDEX.test(token)

const SUB_DELIMS = /%(24|21|26|27|28|29|2A|2B|2C|3B|3D|3A|40)/g
const SAFE_TOKEN = /^[A-Za-z0-9_.~!$&'()*+,;=:@-]*$/

/** Percent-encodes a pointer token for use in a URI fragment (RFC 3986 `pchar` stays literal). */
const encodeToken = (token: string): string => {
  if (SAFE_TOKEN.test(token)) {
    return token
  }
  return encodeURIComponent(token).replace(SUB_DELIMS, (match) =>
    String.fromCharCode(Number.parseInt(match.slice(1), 16)),
  )
}

/** Uniform RFC 6901 encoding of a token array (`~` and `/` escaped, then percent-encoded). */
export const encodeTokens = (
  tokens: ReadonlyArray<string | number>,
): string => {
  if (!tokens.length) {
    return ""
  }
  let out = ""
  for (const token of tokens) {
    out += `/${encodeToken(String(token).replace(TILDE, "~0").replace(SLASH, "~1"))}`
  }
  return out
}

/** Canonical key of a reference target: `document#pointer`. */
export const toKey = (
  document: string,
  tokens: ReadonlyArray<string>,
): string => `${document}#${encodeTokens(tokens)}`

export interface ParsedRef {
  filePath: string // canonical document id
  pointer: string // fragment as written (without `#`)
  normalized: string // `filePath#pointer` (or `filePath` for the whole document)
  tokens?: string[] // decoded RFC 6901 tokens, undefined when the fragment is not a valid pointer
  key?: string // canonical key `filePath#encodedPointer` (set by the graph for valid pointers)
}

/**
 * Spelling of a reference to `document#pointer` that resolves to the same target when written in
 * `fromDocument` (the output document); `undefined` when no relative path can express it.
 */
export const relativeRef = (
  document: string,
  pointer: string,
  fromDocument: string,
): string | undefined => {
  const fragment = pointer ? `#${pointer}` : ""
  if (document === fromDocument) {
    return fragment || "#"
  }
  if (hasScheme(document)) {
    return `${document}${fragment}`
  }
  if (hasScheme(fromDocument)) {
    return undefined
  }
  if (document.charCodeAt(0) === 47 /* "/" */) {
    return `${document}${fragment}`
  }
  const from = fromDocument.split("/").slice(0, -1)
  const to = document.split("/")
  let common = 0
  while (
    common < from.length &&
    common < to.length - 1 &&
    from[common] === to[common]
  ) {
    common++
  }
  const up = from.slice(common)
  if (up.includes("..")) {
    return undefined // climbing out of a `..` directory needs names the ids do not carry
  }
  const path = [...up.map(() => ".."), ...to.slice(common)].join("/")
  return `${path}${fragment}`
}

/**
 * Reference kept in the output for an unresolvable site: as written when the site lies in the output
 * document, otherwise re-spelled relative to it (the canonical id when no relative spelling exists).
 */
export const keptRef = (
  root: { rootDocument: string; rootTokens: string[] },
  site: { ref: string; document: string; normalized: string },
): string => {
  const whole = !root.rootTokens.length
  if (site.document === root.rootDocument && whole) {
    return site.ref
  }
  const [file, pointer] = splitRef(site.ref)
  const document = resolveDocumentId(file, site.document)
  if (document === root.rootDocument && !whole) {
    // the output is a subtree: address the source document by its file name
    const name = document.slice(document.lastIndexOf("/") + 1)
    return hasScheme(document)
      ? site.normalized
      : `${name}${pointer ? `#${pointer}` : ""}`
  }
  return relativeRef(document, pointer, root.rootDocument) ?? site.normalized
}

export const splitRef = ($ref: string): [string, string] => {
  const i = $ref.indexOf("#")
  return i < 0 ? [$ref, ""] : [$ref.slice(0, i), $ref.slice(i + 1)]
}
