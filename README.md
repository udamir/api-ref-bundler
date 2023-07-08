# api-ref-bundler
<img alt="npm" src="https://img.shields.io/npm/v/api-ref-bundler"> <img alt="npm" src="https://img.shields.io/npm/dm/api-ref-bundler?label=npm"> ![GitHub Workflow Status (with event)](https://img.shields.io/github/actions/workflow/status/udamir/api-ref-bundler/node.js.yml) <img alt="npm type definitions" src="https://img.shields.io/npm/types/api-ref-bundler"> <img alt="GitHub" src="https://img.shields.io/github/license/udamir/api-ref-bundler">

This package provides utils to resolve all external/internal references in Json based API document and bundle/dereference into single document

## Works perfectly with API specifications

- [JsonSchema](https://json-schema.org/draft/2020-12/json-schema-core.html)
- [Swagger 2.x](https://github.com/swagger-api/swagger-spec/blob/master/versions/2.0.md)
- [OpenApi 3.x](https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.0.3.md)
- [AsyncApi 2.x](https://www.asyncapi.com/docs/specifications/v2.4.0)

## Features
- bundle all external refs in signle document
- converts external references into internal
- support full and partial dereference
- support external '.md' references
- support for all kinds of circularity
- no concept of resolvers - you are in charge of the whole reading & path parsing process
- no parser included - bring your own!
- Typescript syntax support out of the box
- No dependencies, can be used in nodejs or browser

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
  ignoreSibling?: boolean     // ignore $ref sibling content
  hooks?: {
    onError?: (message: string, ctx: BundleContext) => void // error hook
    onRef?: (ref: string, ctx: BundleContext) => void       // ref hook
    onCrawl?: (value: any, ctx: BundleContext) => void      // node crawl hook
    onExit?: (value: any, ctx: BundleContext) => void      // node crawl exit hook
  }
}
```

#### Dereference options
```ts
interface DereferenceOptions {
  ignoreSibling?: boolean   // ignore $ref sibling content
  fullCrawl?: boolean       // crawl all nodes includin cached
  enableCircular?: boolean  // convert circular $refs to nodes
  hooks?: {
    onError?: (message: string, ctx: DereferenceContext) => void  // error hook
    onRef?: (ref: string, ctx: DereferenceContext) => void        // ref hook
    onCrawl?: (value: any, ctx: DereferenceContext) => void       // node crawl hook
    onExit?: (value: any, ctx: DereferenceContext) => void       // node crawl exit hook
    onCycle?: (ref: string, ctx: DereferenceContext) => void      // cycle refs hook
  }
}
```

### Browsers

A browser version of `api-ref-bundler` is also available via CDN:
```html
<script src="https://cdn.jsdelivr.net/npm/api-ref-bundler@latest/browser/api-ref-bundler.es.js"></script>
<script src="https://cdn.jsdelivr.net/npm/api-ref-bundler@latest/browser/api-ref-bundler.umd.js"></script>
```

Reference `api-ref-bundler.min.js` in your HTML and use the global variable `ApiRefBundler`.
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

## Contributing
When contributing, keep in mind that it is an objective of `api-ref-bundler` to have no package dependencies. This may change in the future, but for now, no-dependencies.

Please run the unit tests before submitting your PR: `npm test`. Hopefully your PR includes additional unit tests to illustrate your change/modification!

## License

MIT
