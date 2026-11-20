# api-ref-bundler benchmark

api-ref-bundler (this repository) compared with the last release (api-ref-bundler 0.5.1) and with popular libraries that bundle or dereference `$ref` documents. Everything below is produced by the scripts in this directory.

## Run it

```sh
pnpm install --ignore-workspace
pnpm run all        # builds the library (pnpm build in the repository root), generates the fixtures, runs every cell and rewrites this file
```

## Environment

| item | value |
|---|---|
| Node | v26.13.0 |
| CPU | Intel(R) Core(TM) i9-9880H CPU @ 2.30GHz, 16 logical cores, 16 GB RAM |
| OS | Darwin 24.6.0 (darwin x64) |
| Date | 2026-11-19T21:27:51.459Z |

| library | version |
|---|---|
| api-ref-bundler (this repository) | `dist/index.mjs` built by `vp pack` |
| api-ref-bundler 0.5.1 | npm release |
| @apidevtools/json-schema-ref-parser | 16.0.8 |
| @redocly/openapi-core | 2.82.0 |
| @stoplight/json-ref-resolver | 3.1.6 |
| @scalar/json-magic | 0.21.0 |
| @scalar/openapi-parser | 0.29.25 |

## Method

Fixtures are OpenAPI 3 documents generated deterministically by `fixtures/generate.mjs`: `openapi` is the Swagger petstore replicated into a 5.1 MB document with internal `$ref`s only; `multi-file` is a spec of 303 files (200 paths, 300 schema files, parameters and shared definitions) with relative references between files, acyclic; `shared-definitions` has 2 000 references into one file of 1 000 definitions; `cyclic` has 1 000 mutually recursive schemas. Every library resolves the files from memory through its own resolver or loader API, so no file I/O and no parsing is measured. Every cell (one library on one fixture) runs in its own fresh Node process that loads only that fixture. Before it is timed, every output is checked: a bundle must contain no external reference and every internal reference must resolve; a dereferenced document must contain no `$ref`; a dereferenced cyclic document must contain no `$ref` and must be circular. Then every cell is warmed up for 20 iterations and timed for 7 runs; tables show the median and the minimum. Cells marked † took more than 0.5 s per iteration and ran with a shortened warm-up. Libraries that change the documents they are given get a fresh copy for every run, made outside the timing (api-ref-bundler and @stoplight/json-ref-resolver leave their input unchanged). Bundles differ in layout between libraries; only what a bundle must guarantee is checked, not its shape. @stoplight/json-ref-resolver only dereferences, so it appears in the dereference tables only. Every cell starts in a fresh process, as a one-off run such as a CLI call does: on the cyclic fixture, libraries that recurse through the document overflow the stack there, although in a process where their code is already optimized (smaller stack frames) the same call can finish.

## Results

### Bundle

median / min ms (lower is better)

| fixture | api-ref-bundler (this repository) | api-ref-bundler 0.5.1 | json-schema-ref-parser [1] | @redocly/openapi-core [2] | @scalar/openapi-parser [3] |
|---|---|---|---|---|---|
| openapi (1 file, 9,600 $refs) | 238.0 / 230.8 | 2.38 s / 2.32 s † | 1.31 s / 1.24 s † | 431.4 / 416.6 | 375.8 / 366.9 |
| multi-file (303 files, 1,492 $refs) | 13.2 / 12.7 | 81.2 / 80.1 | 66.5 / 64.1 | 18.7 / 16.8 | 40.0 / 35.3 |
| shared-definitions (2 files, 2,800 $refs) | 33.2 / 32.3 | 1.16 s / 1.15 s † | 139.6 / 136.7 | 45.8 / 44.7 | 49.5 / 48.0 |
| cyclic (1 file, 3,000 $refs) | 21.7 / 18.8 | 101.8 / 98.0 | — [4] | — [5] | 33.1 / 32.8 |

[1] json-schema-ref-parser: inlines external files at their first reference instead of collecting them in components; changes the documents it is given: every run gets a fresh copy of the files, made outside the timing  
[2] @redocly/openapi-core: changes the documents it is given: every run gets a fresh copy of the files, made outside the timing  
[3] @scalar/openapi-parser: @scalar/json-magic bundle: external files are collected under x-ext; changes the documents it is given: every run gets a fresh copy of the files, made outside the timing  
[4] json-schema-ref-parser on cyclic: RangeError: Maximum call stack size exceeded  
[5] @redocly/openapi-core on cyclic: RangeError: Maximum call stack size exceeded

### Dereference

median / min ms (lower is better)

| fixture | api-ref-bundler (this repository) | api-ref-bundler 0.5.1 | json-schema-ref-parser [1] | @redocly/openapi-core [2] | @stoplight/json-ref-resolver | @scalar/openapi-parser [3] |
|---|---|---|---|---|---|---|
| openapi (1 file, 9,600 $refs) | 230.5 / 227.2 | 2.24 s / 2.13 s † | 648.5 / 640.3 † | 468.2 / 438.3 | 1.26 s / 1.22 s † | 833.6 / 797.6 † |
| multi-file (303 files, 1,492 $refs) | 8.1 / 7.9 | 62.5 / 58.8 | 36.2 / 35.6 | 22.5 / 20.8 | 372.2 / 366.7 | 64.0 / 60.5 |
| shared-definitions (2 files, 2,800 $refs) | 23.6 / 22.8 | 125.5 / 124.5 | 71.4 / 70.6 | 48.1 / 42.1 | 5.26 s / 5.16 s † | 84.3 / 80.1 |

[1] json-schema-ref-parser: changes the documents it is given: every run gets a fresh copy of the files, made outside the timing  
[2] @redocly/openapi-core: changes the documents it is given: every run gets a fresh copy of the files, made outside the timing  
[3] @scalar/openapi-parser: bundled with @scalar/json-magic, then dereferenced with @scalar/openapi-parser; changes the documents it is given: every run gets a fresh copy of the files, made outside the timing

### Dereference with circular references

median / min ms (lower is better)

| fixture | api-ref-bundler (this repository) | api-ref-bundler 0.5.1 | json-schema-ref-parser [1] | @redocly/openapi-core [2] | @stoplight/json-ref-resolver | @scalar/openapi-parser [3] |
|---|---|---|---|---|---|---|
| cyclic (1 file, 3,000 $refs) | 19.3 / 16.7 | 3.41 s / 3.33 s † | — [4] | — [5] | — [6] | 61.8 / 59.4 |

[1] json-schema-ref-parser: changes the documents it is given: every run gets a fresh copy of the files, made outside the timing  
[2] @redocly/openapi-core: changes the documents it is given: every run gets a fresh copy of the files, made outside the timing  
[3] @scalar/openapi-parser: changes the documents it is given: every run gets a fresh copy of the files, made outside the timing  
[4] json-schema-ref-parser on cyclic: RangeError: Maximum dereference depth (500) exceeded at #/components/schemas/C0/properties/a/properties/a/properties/a/properties/a/properties/a/properties/a…  
[5] @redocly/openapi-core on cyclic: RangeError: Maximum call stack size exceeded  
[6] @stoplight/json-ref-resolver on cyclic: Error: dereference left 3000 references
