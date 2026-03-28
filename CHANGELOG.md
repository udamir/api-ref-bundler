# Changelog

All notable changes to this project will be documented in this file.

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
