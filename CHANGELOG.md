# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0]

Redesign of the resolution core around a reference graph: one phase loads documents and resolves every reference site to its target, a planner assigns deterministic definition slots, and two emitters produce the bundled or dereferenced document.

### Security

- **Fix Prototype Pollution bypass in `setValueByPath` (CWE-1321)**: a non-string path segment such as `[["__proto__"], "polluted"]` passed the string-only `__proto__`/`constructor`/`prototype` check and was then coerced to `"__proto__"` by the property access, writing to `Object.prototype` (still exploitable in 0.5.1 after the earlier fix). Path segments are now coerced to a property key once, checked, and written as own properties; `getValueByPath` coerces the same way, and a `null` intermediate is replaced instead of throwing
- A JSON-parsed `__proto__` key in a document, a `$ref` sibling or a merged value stays an own data property in the output instead of replacing the prototype of the output object (`mergeValues`, sibling merging and both emitters)

### Added

- `createBundler(entry, resolver, options)` → `{ graph, bundle(), dereference(), errors, sourceMap }`: build the reference graph once and emit both outputs from it
- `bundleSync` / `dereferenceSync(entry, documents: Map<string, unknown>, options)` over pre-loaded documents
- `siblingStrategy?: "merge" | "allOf" | "override" | "ignore"` on `BundleOptions` and `DereferenceOptions` (default `"merge"`, `ignoreSibling: true` ≡ `"ignore"`)
- `BundleOptions.definitions?: { container?, naming? }` to force the definition container (e.g. `/$defs`) and to name hoisted definitions
- `BundleOptions.parallelCrawl` and a working `DereferenceOptions.parallelCrawl`: documents discovered in one wave are loaded concurrently
- third `detail` argument of `hooks.onError`: `{ type: "missing" | "error" | "invalid-pointer" | "cycle-without-content", ref, document, tokens }`; `RefResolveError` for base-document failures
- `RefMapRule.refs?: "string"` for string-valued reference locations; `discriminator.mapping/*` and `links/*/operationRef` are rewritten by `bundle`
- `RefMapRule.literal?: true` for locations whose value is data: a `$ref` member inside is neither resolved, loaded nor reported
- `ResolverPointer.found: boolean`; `parseRef(...).tokens`; new utility exports (`parseTokens`, `encodeTokens`, `toKey`, `resolveDocumentId`, `normalizeDocumentId`, `hasScheme`, `normalize`, `walkTokens`, `isModernJsonSchema`, `planBundle`, `buildReferenceGraph`, …)

### Changed

- Reference identity follows RFC 3986 §5.2: relative references against `http(s)://`, `localhost`, `file:` bases resolve as URLs, absolute-path references replace the base path, `bundle` and `dereference` normalise the base path identically
- Pointers follow RFC 6901 strictly: percent-decoding before `~1`/`~0`, `~` followed by anything but `0`/`1` is an invalid pointer, `#/` is the member `""`, array indexes `0 | [1-9][0-9]*`, only own properties are traversed
- `null`, `0`, `""`, `false` are valid targets; resolver failures for the base document reject the promise instead of yielding `undefined` / `{}`
- `bundle` reports every unresolvable reference through `onError`, including missing pointers inside the entry document, which 0.5.x left silent
- An unresolvable reference is kept as written when it is in the entry document, and re-spelled relative to the entry document when it comes from another file (0.5.x wrote the path relative to the resolver root, which points elsewhere when the entry is in a sub-directory)
- Literal values are no longer resolved: a `$ref` member inside JSON Schema `const`/`enum`, OpenAPI Example Object `value`/`dataValue`, Link `parameters`/`requestBody`, OAuth `scopes` and AsyncAPI message `examples` is kept as data; annotations (`example`, `examples`, `default`) are still resolved
- An external `$ref` in an OpenAPI media type, parameter or header `example` is inlined instead of being hoisted to `#/components/examples`, which holds Example Objects
- Primitive and array targets are bundled as primitives and arrays
- Deterministic bundle layout independent of crawl order; emitted pointers are strictly RFC 6901-resolvable and uniformly encoded, alias chains are collapsed
- Hoisted documents keep their `definitions`/`$defs` and pointers into them are rewritten through the slot; Swagger 2 `responses.*.schema` is hoisted to `#/definitions`
- Hoisted and inlined content from other documents drops its `$id` (and draft-04 `id`): its pointers are rewritten against the bundle root, which an embedded `$id` would re-base, so validators failed to compile the bundle
- An external target reached through an internal alias (`{ $ref: "#/defs/X" }` with `defs.X: { $ref: "b.json" }`) is placed at the alias location instead of at the first reference crawled
- A `$ref` with siblings into its own siblings (e.g. a root `{ $ref: "#/definitions/X", definitions: {…} }`) is resolved instead of being reported as a pure loop; references inside `$ref` siblings are no longer mistaken for cycles, and a reference back to a `$ref` node with siblings is a cycle to that node
- JSON Schema documents declaring draft 2019-09/2020-12 (or having `$defs`) are detected as JSON Schema and bundled into `#/$defs`
- `ignoreSibling` applies to hoisted references too; `enableCircular` leaves no `Symbol` on the output; pure `$ref` loops are reported through `onError`/`onCycle` instead of becoming a self-`$ref`
- Cycle detection is identity based: a target already being materialised on the current path is a cycle; `fullCrawl` revisits memoised output without re-resolving, so it always terminates
- Performance: on a 5.1 MB OpenAPI document `bundle` is 10× and `dereference` 9× faster than 0.5.1; a 303-file spec is bundled 6× and dereferenced 7× faster, 2 000 references into one shared file are bundled 36× faster, and a document of 1 000 mutually recursive schemas is dereferenced with `enableCircular` 200× faster. Depth 5 000 completes, 10 000-file chains and thousands of distinct definitions are linear
- `json-crawl` dependency bumped from 0.4.2 to 1.2.0

### Removed

- the internal `dereferenceHook` export (the hook is replaced by the graph emitters); `RefNode`, `DereferenceState`, `BundleState` are still exported with a new shape

## [0.5.1]

### Security

- **Fix Prototype Pollution vulnerability (CVE pending)**: `setValueByPath` and `getValueByPath` in `src/utils.ts` now reject unsafe path segments (`__proto__`, `constructor`, `prototype`) to prevent Object.prototype pollution ([#472](https://github.com/udamir/api-ref-bundler/issues/472), CWE-1321, CVSS 7.5)

## [0.5.0]

### Added

- **AsyncAPI v3 Support**: Full support for bundling and dereferencing AsyncAPI 3.x documents
  - New `asyncapi3.ts` rules module with comprehensive reference mapping
  - Support for AsyncAPI v3's restructured architecture (top-level operations, channel-scoped messages)
  - Automatic detection of AsyncAPI v3 documents via `asyncapi: 3.0.0` version field

## [0.4.3]

### Features
- OpenAPI 3.x basic support
- Swagger 2.x support
- AsyncAPI 2.x support
- JSON Schema support
- Bundle and dereference functionality
- Circular reference handling with `enableCircular` option
- Error hooks for unresolved references
- Sibling content preservation with `ignoreSibling` option
