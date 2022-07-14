# api-ref-bundler
<img alt="npm" src="https://img.shields.io/npm/v/api-ref-bundler"> <img alt="npm" src="https://img.shields.io/npm/dm/api-ref-bundler?label=npm"> <img alt="npm type definitions" src="https://img.shields.io/npm/types/api-ref-bundler"> <img alt="GitHub" src="https://img.shields.io/github/license/udamir/api-ref-bundler">

This package provides utils to resolve all external references in Json based API document and bundle into single document

## Works perfectly with API specifications

- [JsonSchema](https://json-schema.org/draft/2020-12/json-schema-core.html)
- [Swagger 2.x](https://github.com/swagger-api/swagger-spec/blob/master/versions/2.0.md)
- [OpenApi 3.x](https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.0.3.md)
- [AsyncApi 2.x](https://www.asyncapi.com/docs/specifications/v2.4.0)

## Features
- bundle all external refs in signle document
- converts external references into internal
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
import { bundle } from 'api-ref-bundler'

const bundler = new ApiRefBundler("schema.json", async (sourcePath) => {
  const data = await fs.readFile(path.join(__dirname, "./", sourcePath), "utf8")
  return sourcePath.slice(-3) === ".md" ? data : JSON.parse(data)      
})

bundler.run().then(schema => {
  console.log(schema)
}).catch(errors => {
  console.log(errors)
})
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
  var bundler = ApiRefBundler.create("http://example.com/schema", async (sourcePath) => {
    const data = await fetch(sourcePath)
    return sourcePath.slice(-3) === ".md" ? data.text() : data.json()
  })

  bundler.run().then(schema => {
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
