# api-ref-bundler
<img alt="npm" src="https://img.shields.io/npm/v/api-ref-bundler"> <img alt="npm" src="https://img.shields.io/npm/dm/api-ref-bundler?label=npm"> ![GitHub Workflow Status (with event)](https://img.shields.io/github/actions/workflow/status/udamir/api-ref-bundler/node.js.yml) <img alt="npm type definitions" src="https://img.shields.io/npm/types/api-ref-bundler"> <img alt="GitHub" src="https://img.shields.io/github/license/udamir/api-ref-bundler">

This package provides utils to resolve all external/internal references in Json based API document and bundle/dereference into single document

## Works perfectly with API specifications

- [JsonSchema](https://json-schema.org/draft/2020-12/json-schema-core.html)
- [Swagger 2.x](https://github.com/swagger-api/swagger-spec/blob/master/versions/2.0.md)
- [OpenApi 3.x](https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.0.3.md)
- [AsyncApi 2.x](https://www.asyncapi.com/docs/specifications/v2.4.0)
- [AsyncApi 3.x](https://www.asyncapi.com/docs/reference/specification/v3.0.0)

## Features
- bundle all external refs in single document
- converts external references into internal, strictly RFC 6901-resolvable pointers (deterministic layout)
- support full and partial dereference
- support external '.md' references
- support for all kinds of circularity
- reference graph shared between `bundle` and `dereference` (`createBundler`), synchronous variants over pre-loaded documents
- typed errors (`onError` detail, `RefResolveError`), source map of hoisted definitions
- no concept of resolvers - you are in charge of the whole reading & path parsing process
- no parser included - bring your own!
- Typescript syntax support out of the box
- No dependencies (apart from `json-crawl`), can be used in nodejs or browser

## Installation
```SH
npm install api-ref-bundler --save
```

## Usage

### Nodejs
```ts
import { promises as fs } from 'fs'
import { bundle, dereference } from 'api-ref-bundler'

const resolver = async (sourcePath) => {
  const data = await fs.readFile(path.join(__dirname, "./", sourcePath), "utf8")
  return sourcePath.slice(-3) === ".md" ? data : JSON.parse(data)      
}

// bundle (convert all external refs to internal)
bundle("schema.json", resolver, { ignoreSibling: true }).then(schema => {
  console.log(schema)
}).catch(errors => {
  console.log(errors)
})

const onErrorHook = (msg: string) => {
  throw new Error(msg)
}

// full dereference (remove all refs)
dereference("schema.json", resolver, { hooks: { onError: onErrorHook }}).then(schema => {
  console.log(schema)
}).catch(errors => {
  console.log(errors)
})

// partial dereference (remove all refs in path '/properties/foo')
dereference("schema.json#/properties/foo", resolver).then(foo => {
  console.log(foo)
}).catch(errors => {
  console.log(errors)
})

```

#### Bundle options
```ts
interface BundleOptions {
  ignoreSibling?: boolean           // ignore $ref sibling content (same as siblingStrategy: "ignore")
  siblingStrategy?: "merge" | "allOf" | "override" | "ignore" // how $ref siblings are combined (default "merge")
  parallelCrawl?: boolean           // load the documents discovered in one wave concurrently
  rules?: RefMapRules               // custom reference rules (where refs are allowed, where definitions go)
  definitions?: {
    container?: `/${string}`        // force the definition container, e.g. "/$defs"
    naming?: (target: { document: string, tokens: string[], node: unknown }) => string // base name of a hoisted definition
  }
  hooks?: {
    onError?: (message: string, ctx: BundleContext, detail?: RefErrorDetail) => void // error hook
    onRef?: (ref: string, ctx: BundleContext) => void       // ref hook
    onCrawl?: (value: any, ctx: BundleContext) => void      // node crawl hook
    onExit?: (value: any, ctx: BundleContext) => void       // node crawl exit hook
  }
}
```

#### Dereference options
```ts
interface DereferenceOptions {
  ignoreSibling?: boolean           // ignore $ref sibling content (same as siblingStrategy: "ignore")
  siblingStrategy?: "merge" | "allOf" | "override" | "ignore" // how $ref siblings are combined (default "merge")
  fullCrawl?: boolean               // hooks revisit shared (memoised) subtrees
  enableCircular?: boolean          // convert circular $refs to JS object cycles
  parallelCrawl?: boolean           // load the documents discovered in one wave concurrently
  hooks?: {
    onError?: (message: string, ctx: DereferenceContext, detail?: RefErrorDetail) => void // error hook
    onRef?: (ref: string, ctx: DereferenceContext) => void        // ref hook
    onCrawl?: (value: any, ctx: DereferenceContext) => void       // node crawl hook
    onExit?: (value: any, ctx: DereferenceContext) => void        // node crawl exit hook
    onCycle?: (ref: string, ctx: DereferenceContext) => void      // cycle refs hook
  }
}
```

#### Sibling strategies

Content written next to a `$ref` is combined with the referenced value according to `siblingStrategy`:

| Strategy | `dereference` | `bundle` |
|---|---|---|
| `"merge"` (default) | `mergeValues(target, siblings)` — siblings override scalars, arrays are concatenated (0.5.x behaviour) | `{ $ref: "#/...", ...siblings }` |
| `"allOf"` | `{ allOf: [target, siblings] }` — the conjunction JSON Schema 2019-09+ / OpenAPI 3.1 define | `{ allOf: [{ $ref: "#/..." }, siblings] }` |
| `"override"` | only `description` and `summary` are taken from the siblings (OpenAPI 3.0 Reference Object) | `{ $ref: "#/...", description?, summary? }` |
| `"ignore"` | siblings are dropped (`ignoreSibling: true`) | `{ $ref: "#/..." }` |

#### Definitions placement

External targets referenced from a location that allows a reference are hoisted into the container the rules define for that location (`#/components/schemas`, `#/definitions`, …). For plain JSON Schema documents the container is `#/definitions`, or `#/$defs` when the document declares `$schema` draft 2019-09/2020-12 or already has `$defs`; `definitions.container` forces either. Names are taken from `$id` → `id` → file name (or the last pointer segment for `file#/pointer` targets) and de-duplicated with a counter (`Pet`, `Pet1`, …); a root definition that is a pure alias of the external reference (`definitions: { Pet: { $ref: "pet.json" } }`) is reused as the slot. The layout depends only on the documents, not on crawl order; a hoisted document keeps its own `definitions`/`$defs`, and pointers into it are rewritten through its slot (`#/definitions/lib/definitions/Inner`); its `$id` (draft-04 `id`) is dropped, since those pointers resolve against the bundle root. Emitted pointers are strictly RFC 6901-resolvable: they never walk through an intermediate `$ref` and are uniformly percent-encoded.

#### Errors

A base document that cannot be loaded, or an entry pointer that does not exist, rejects the returned promise with a `RefResolveError` (`error.detail: { type, ref, document, tokens }`). Any other unresolvable reference is reported through `hooks.onError(message, ctx, detail)` with `detail.type` one of `"missing"`, `"error"` (the resolver threw), `"invalid-pointer"` or `"cycle-without-content"` (a pure `$ref` → `$ref` loop); the original reference is kept in the output (as written in the entry document; a reference from another file is re-spelled relative to the entry document). `null`, `0`, `""` and `false` are valid targets.

#### Literal values

In OpenAPI, Swagger, AsyncAPI and JSON Schema documents, values that are data rather than document parts are copied as they are, even when they contain a `$ref` member: JSON Schema `const` and `enum`, OpenAPI Example Object `value` and `dataValue`, Link `parameters` and `requestBody`, OAuth flow `scopes` and AsyncAPI message `examples`. Such a `$ref` is not loaded and not reported. Annotations (`example`, `examples`, `default`) are resolved like any other location. Custom rules mark a location the same way with `{ literal: true }`; documents of an unknown type have no literal locations.

### Shared graph and synchronous variants

```ts
import { createBundler, bundleSync, dereferenceSync } from 'api-ref-bundler'

// load every document once, then emit both outputs from the same reference graph
const bundler = await createBundler("schema.json", resolver, { siblingStrategy: "allOf" })
const bundled = bundler.bundle()                 // same as bundle("schema.json", resolver, options)
const dereferenced = bundler.dereference()       // same as dereference("schema.json", resolver, options)
bundler.errors                                   // typed errors collected while building the graph
bundler.sourceMap.get("#/definitions/Pet")       // { document: "schemas/pet.json", tokens: [] }
bundler.graph                                    // documents, reference sites and targets

// synchronous: every document is already in memory, keyed by its (normalised) path or URL
const documents = new Map([["schema.json", schema], ["schemas/pet.json", pet]])
const bundledSync = bundleSync("schema.json", documents)
const dereferencedSync = dereferenceSync("schema.json#/properties/pet", documents)
```

### Browsers

A browser version of `api-ref-bundler` is also available via CDN:
```html
<script src="https://cdn.jsdelivr.net/npm/api-ref-bundler@latest"></script>
```

Reference `api-ref-bundler` in your HTML and use the global variable `ApiRefBundler`.
```HTML
<script>
  const resolver = async (sourcePath) => {
    const data = await fetch(sourcePath)
    return sourcePath.slice(-3) === ".md" ? data.text() : data.json()
  }

  ApiRefBundler.bundle("http://example.com/schema", resolver).then(schema => {
    console.log(schema)
  }).catch(errors => {
    console.log(errors)
  })  
</script>
```

## Migrating to 1.0.0

The public API is unchanged and additive; the output contract changed in the following ways (see `CHANGELOG.md`):

- the bundle layout is deterministic (sorted discovery order) and no longer depends on crawl order;
- emitted pointers are strictly RFC 6901-resolvable and uniformly encoded (`#/definitions/required%20string`), alias chains are collapsed instead of walking through a `$ref`;
- a hoisted document keeps its `definitions`/`$defs`, pointers into them go through the slot (`#/definitions/lib/definitions/X`) instead of being hoisted a second time under a renamed key;
- JSON Schema 2019-09/2020-12 documents receive their definitions in `#/$defs`;
- a failing base document rejects the promise (`RefResolveError`) instead of resolving to `undefined` / `{}`; falsy targets resolve; primitives and arrays are bundled as what they are;
- `enableCircular` leaves no `Symbol` marker on the output; a pure `$ref` loop is reported (`cycle-without-content`) instead of becoming a self-pointing `$ref`;
- `#/` addresses the member named `""`, percent-decoding happens before `~1`/`~0` unescaping, array indexes must match `0 | [1-9][0-9]*`;
- `bundle` reports unresolvable references of the entry document through `onError` (0.5.x left them silent); a kept unresolvable reference is written as authored, or relative to the entry document when it comes from another file;
- `$ref` members inside literal values (`enum`, `const`, Example `value`/`dataValue`, Link `parameters`/`requestBody`, OAuth `scopes`, AsyncAPI message `examples`) are kept as data;
- content hoisted from another document drops its `$id` (draft-04 `id`);
- `parallelCrawl` now loads documents concurrently.

## Performance

Minimum time in ms, lower is better. Every library resolves the same documents from memory, and every output is checked before it is timed (no external reference left after a bundle, no `$ref` left after a dereference).

| task | api-ref-bundler | api-ref-bundler 0.5.1 | json-schema-ref-parser | @redocly/openapi-core | @stoplight/json-ref-resolver | @scalar/openapi-parser |
|---|---|---|---|---|---|---|
| bundle a 5.1 MB OpenAPI document (9 600 `$ref`s) | 231 | 2 320 | 1 240 | 417 | (no bundling) | 367 |
| dereference it | 227 | 2 130 | 640 | 438 | 1 220 | 798 |
| bundle a spec of 303 files | 13 | 80 | 64 | 17 | (no bundling) | 35 |
| dereference it | 7.9 | 59 | 36 | 21 | 367 | 61 |
| dereference 1 000 mutually recursive schemas (`enableCircular`) | 17 | 3 330 | fails (depth limit) | fails (stack overflow) | leaves the `$ref`s | 59 |

- api-ref-bundler is the fastest of the libraries measured in every task: 1.3–3.6× faster than the next one, and 5–36× faster than 0.5.1 (200× on the cyclic document).
- It does not change the documents it is given; json-schema-ref-parser, @redocly/openapi-core and @scalar/openapi-parser do, so their timings exclude the copy a caller needs to keep the originals.
- Bundles differ in layout: api-ref-bundler and Redocly collect external definitions in `components`, json-schema-ref-parser inlines them at their first reference, Scalar collects them under `x-ext`.

Full tables, more fixtures and the method: [bench/README.md](bench/README.md).

## Contributing
When contributing, keep in mind that it is an objective of `api-ref-bundler` to have no package dependencies. This may change in the future, but for now, no-dependencies.

Please run the checks and unit tests before submitting your PR: `pnpm lint && pnpm typecheck && pnpm test`. Hopefully your PR includes additional unit tests to illustrate your change/modification!

## License

MIT
