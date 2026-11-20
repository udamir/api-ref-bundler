import { describe, expect, it } from "vite-plus/test"
import { bundle, dereference } from "../../src"
import { calcJsonType } from "../../src/utils"
import {
  expectAllRefsInternalAndResolvable,
  memResolver,
  resolveInternal,
} from "./helpers"

// Block S: spec-specific reference locations and definition placement

const openapi = {
  "oas.json": {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    paths: {
      "/pets": { $ref: "paths.json#/pets" },
      "/local": {
        get: {
          parameters: [{ $ref: "params.json#/limit" }],
          requestBody: { $ref: "bodies.json#/Body" },
          responses: {
            "200": {
              description: "ok",
              headers: { "X-H": { $ref: "headers.json#/XH" } },
              links: { l: { $ref: "links.json#/L" } },
              content: {
                "application/json": {
                  schema: { $ref: "schemas.json#/Pet" },
                  examples: { ex: { $ref: "examples.json#/E" } },
                  encoding: {
                    f: { headers: { "X-E": { $ref: "headers.json#/XH" } } },
                  },
                },
              },
            },
            "404": { $ref: "responses.json#/NotFound" },
          },
          callbacks: { cb: { $ref: "callbacks.json#/CB" } },
          security: [{ api_key: [] }],
        },
      },
    },
    components: {
      schemas: {
        Base: {
          oneOf: [{ $ref: "schemas.json#/Pet" }],
          discriminator: {
            propertyName: "t",
            mapping: {
              pet: "schemas.json#/Pet",
              loc: "#/components/schemas/Base",
            },
          },
        },
      },
      securitySchemes: { api_key: { $ref: "security.json#/ApiKey" } },
      pathItems: { PI: { $ref: "paths.json#/pets" } },
    },
    webhooks: { w: { $ref: "paths.json#/pets" } },
    "x-vendor": { $ref: "schemas.json#/Pet" },
  },
  "paths.json": {
    pets: {
      get: {
        responses: {
          "200": {
            description: "ok",
            content: {
              "application/json": { schema: { $ref: "schemas.json#/Pet" } },
            },
          },
        },
      },
    },
  },
  "params.json": {
    limit: {
      name: "limit",
      in: "query",
      schema: { $ref: "schemas.json#/Pet" },
    },
  },
  "bodies.json": {
    Body: {
      content: {
        "application/json": { schema: { $ref: "schemas.json#/Pet" } },
      },
    },
  },
  "responses.json": { NotFound: { description: "nf" } },
  "schemas.json": {
    Pet: {
      type: "object",
      properties: { id: { type: "integer" }, err: { $ref: "#/Error" } },
    },
    Error: { type: "object" },
  },
  "headers.json": { XH: { schema: { type: "string" } } },
  "links.json": { L: { operationId: "x" } },
  "examples.json": { E: { value: 1 } },
  "callbacks.json": {
    CB: {
      "{$request.body#/url}": {
        post: { responses: { "200": { description: "ok" } } },
      },
    },
  },
  "security.json": { ApiKey: { type: "apiKey", in: "header", name: "k" } },
}

describe("S5 spec rules", () => {
  it("S5.1 OpenAPI 3: every Reference Object location is hoisted into its components section", async () => {
    const bundled: any = await bundle("oas.json", memResolver(openapi).resolver)
    const op = bundled.paths["/local"].get
    expect(op.parameters[0].$ref).toBe("#/components/parameters/limit")
    expect(op.requestBody.$ref).toBe("#/components/requestBodies/Body")
    expect(op.responses["404"].$ref).toBe("#/components/responses/NotFound")
    expect(op.responses["200"].headers["X-H"].$ref).toBe(
      "#/components/headers/XH",
    )
    expect(op.responses["200"].links.l.$ref).toBe("#/components/links/L")
    expect(op.responses["200"].content["application/json"].schema.$ref).toBe(
      "#/components/schemas/Pet",
    )
    expect(
      op.responses["200"].content["application/json"].examples.ex.$ref,
    ).toBe("#/components/examples/E")
    expect(
      op.responses["200"].content["application/json"].encoding.f.headers["X-E"]
        .$ref,
    ).toBe("#/components/headers/XH")
    expect(op.callbacks.cb.$ref).toBe("#/components/callbacks/CB")
    expect(bundled.components.parameters.limit.schema.$ref).toBe(
      "#/components/schemas/Pet",
    )
    expect(bundled.components.schemas.Pet.properties.err.$ref).toBe(
      "#/components/schemas/Error",
    )
    expect(bundled.components.securitySchemes.api_key).toEqual({
      type: "apiKey",
      in: "header",
      name: "k",
    })
  })

  it("S5.2 OpenAPI 3: an external path item is resolved and reused by pathItems/webhooks", async () => {
    const bundled: any = await bundle("oas.json", memResolver(openapi).resolver)
    expect(bundled.paths["/pets"].get).toBeDefined()
    expect(bundled.paths["/pets"].$ref).toBeUndefined()
    expect(
      bundled.paths["/pets"].get.responses["200"].content["application/json"]
        .schema.$ref,
    ).toBe("#/components/schemas/Pet")
    expect(bundled.components.pathItems.PI).toEqual({ $ref: "#/paths/~1pets" })
    expect(bundled.webhooks.w).toEqual({ $ref: "#/paths/~1pets" })
  })

  // ISSUE-RB-11: discriminator.mapping values are "schema names or references" (OAS 3.0 §4.7.25 / 3.1 §4.8.25) but bundle() does not rewrite them, so an external reference survives in the bundled document.
  it("S5.3 OpenAPI 3: external discriminator.mapping references are rewritten", async () => {
    const bundled: any = await bundle("oas.json", memResolver(openapi).resolver)
    expect(bundled.components.schemas.Base.discriminator.mapping.pet).toMatch(
      /^#\//,
    )
    expect(bundled.components.schemas.Base.discriminator.mapping.loc).toBe(
      "#/components/schemas/Base",
    )
  })

  it("S5.4 OpenAPI 3: security requirements are not refs and vendor extensions are resolved without hoisting", async () => {
    const bundled: any = await bundle("oas.json", memResolver(openapi).resolver)
    expect(bundled.paths["/local"].get.security).toEqual([{ api_key: [] }])
    expect(bundled["x-vendor"].$ref).toMatch(/^#\//)
    const mapping = bundled.components.schemas.Base.discriminator.mapping
    bundled.components.schemas.Base.discriminator.mapping = {}
    expectAllRefsInternalAndResolvable(bundled)
    bundled.components.schemas.Base.discriminator.mapping = mapping
  })

  const swagger = {
    "sw.json": {
      swagger: "2.0",
      info: { title: "t", version: "1" },
      paths: {
        "/p": {
          parameters: [{ $ref: "p.json#/Path" }],
          get: {
            parameters: [{ $ref: "p.json#/Limit" }],
            responses: {
              "200": { $ref: "r.json#/Ok" },
              "404": { description: "nf", schema: { $ref: "s.json#/Err" } },
            },
          },
        },
      },
      definitions: { Local: { $ref: "s.json#/Err" } },
      securityDefinitions: { k: { $ref: "sec.json#/K" } },
    },
    "p.json": {
      Limit: { name: "limit", in: "query", type: "integer" },
      Path: { name: "id", in: "path", required: true, type: "string" },
    },
    "r.json": { Ok: { description: "ok", schema: { $ref: "s.json#/Pet" } } },
    "s.json": {
      Pet: { type: "object" },
      Err: { type: "object", properties: { code: { type: "integer" } } },
    },
    "sec.json": { K: { type: "apiKey", in: "header", name: "k" } },
  }

  it("S5.5 Swagger 2: parameters, responses and definitions are hoisted to the root sections", async () => {
    const bundled: any = await bundle("sw.json", memResolver(swagger).resolver)
    expect(bundled.paths["/p"].parameters[0].$ref).toBe("#/parameters/Path")
    expect(bundled.paths["/p"].get.parameters[0].$ref).toBe(
      "#/parameters/Limit",
    )
    expect(bundled.paths["/p"].get.responses["200"].$ref).toBe("#/responses/Ok")
    expect(bundled.securityDefinitions.k).toEqual({
      type: "apiKey",
      in: "header",
      name: "k",
    })
    expect(bundled.components).toBeUndefined()
    expectAllRefsInternalAndResolvable(bundled)
  })

  // ISSUE-RB-10: swaggerRefMap nests response children one level too deep ("/responses/*/*/schema" instead of "/responses/*/schema"), so external schemas under a response are inlined rather than hoisted to #/definitions, and alias definitions end up pointing into paths.
  it("S5.6 Swagger 2: response schemas are hoisted into #/definitions", async () => {
    const bundled: any = await bundle("sw.json", memResolver(swagger).resolver)
    expect(bundled.paths["/p"].get.responses["404"].schema.$ref).toMatch(
      /^#\/definitions\//,
    )
    expect(bundled.responses.Ok.schema.$ref).toMatch(/^#\/definitions\//)
    expect(bundled.definitions.Local).toEqual(swagger["s.json"].Err)
  })

  const asyncapi2 = {
    "a2.json": {
      asyncapi: "2.6.0",
      info: { title: "t", version: "1" },
      servers: { prod: { $ref: "srv.json#/Prod" } },
      channels: {
        "user/signedup": { $ref: "ch.json#/Signup" },
        local: {
          publish: {
            message: { $ref: "msg.json#/UserSignedUp" },
            traits: [{ $ref: "traits.json#/OpTrait" }],
          },
          parameters: { id: { $ref: "params.json#/Id" } },
        },
      },
      components: {
        schemas: { S: { $ref: "schemas.json#/User" } },
        securitySchemes: { k: { $ref: "sec.json#/K" } },
      },
    },
    "srv.json": { Prod: { url: "mqtt://x", protocol: "mqtt" } },
    "ch.json": {
      Signup: {
        subscribe: { message: { oneOf: [{ $ref: "msg.json#/UserSignedUp" }] } },
      },
    },
    "msg.json": {
      UserSignedUp: {
        payload: { $ref: "schemas.json#/User" },
        headers: { $ref: "schemas.json#/Headers" },
        traits: [{ $ref: "traits.json#/MsgTrait" }],
        correlationId: { $ref: "corr.json#/C" },
      },
    },
    "schemas.json": { User: { type: "object" }, Headers: { type: "object" } },
    "traits.json": {
      OpTrait: { bindings: { kafka: {} } },
      MsgTrait: { contentType: "application/json" },
    },
    "params.json": { Id: { schema: { type: "string" } } },
    "corr.json": { C: { location: "$message.header#/correlationId" } },
    "sec.json": { K: { type: "apiKey", in: "user" } },
  }

  it("S5.7 AsyncAPI 2: servers, channels, messages, traits, correlationIds, parameters, schemas go to components", async () => {
    const bundled: any = await bundle(
      "a2.json",
      memResolver(asyncapi2).resolver,
    )
    expect(bundled.servers.prod.$ref).toBe("#/components/servers/Prod")
    expect(bundled.channels["user/signedup"].$ref).toBe(
      "#/components/channels/Signup",
    )
    expect(bundled.channels.local.publish.message.$ref).toBe(
      "#/components/messages/UserSignedUp",
    )
    expect(bundled.channels.local.publish.traits[0].$ref).toBe(
      "#/components/operationTraits/OpTrait",
    )
    expect(bundled.channels.local.parameters.id.$ref).toBe(
      "#/components/parameters/Id",
    )
    const msg = bundled.components.messages.UserSignedUp
    expect(msg.payload.$ref).toBe("#/components/schemas/S")
    expect(msg.headers.$ref).toBe("#/components/schemas/Headers")
    expect(msg.traits[0].$ref).toBe("#/components/messageTraits/MsgTrait")
    expect(msg.correlationId.$ref).toBe("#/components/correlationIds/C")
    expect(
      bundled.components.channels.Signup.subscribe.message.oneOf[0].$ref,
    ).toBe("#/components/messages/UserSignedUp")
    expect(bundled.components.securitySchemes.k).toEqual({
      type: "apiKey",
      in: "user",
    })
    expectAllRefsInternalAndResolvable(bundled)
  })

  const asyncapi3 = {
    "a3.json": {
      asyncapi: "3.0.0",
      info: { title: "t", version: "1" },
      servers: { prod: { $ref: "srv.json#/Prod" } },
      channels: {
        Ch: {
          address: "x",
          messages: { M: { $ref: "msg.json#/M" } },
          servers: [{ $ref: "#/servers/prod" }],
          parameters: { id: { $ref: "params.json#/Id" } },
        },
        ExtCh: { $ref: "ch.json#/Ext" },
      },
      operations: {
        Op: {
          action: "send",
          channel: { $ref: "#/channels/Ch" },
          messages: [{ $ref: "#/channels/Ch/messages/M" }],
          reply: {
            channel: { $ref: "ch.json#/Ext" },
            messages: [{ $ref: "#/channels/ExtCh/messages/E" }],
          },
          security: [{ $ref: "sec.json#/K" }],
          traits: [{ $ref: "traits.json#/T" }],
        },
        ExtOp: { $ref: "ops.json#/O" },
      },
      components: {
        securitySchemes: { k: { $ref: "sec.json#/K" } },
        channels: { CompCh: { $ref: "ch.json#/Ext" } },
      },
    },
    "srv.json": { Prod: { host: "x", protocol: "mqtt" } },
    "msg.json": {
      M: {
        payload: { $ref: "schemas.json#/User" },
        headers: { $ref: "schemas.json#/H" },
      },
    },
    "schemas.json": { User: { type: "object" }, H: { type: "object" } },
    "ch.json": {
      Ext: {
        address: "ext",
        messages: { E: { payload: { $ref: "schemas.json#/User" } } },
      },
    },
    "ops.json": { O: { action: "receive", channel: { $ref: "ch.json#/Ext" } } },
    "params.json": { Id: { description: "id" } },
    "sec.json": { K: { type: "apiKey", in: "user" } },
    "traits.json": { T: { summary: "t" } },
  }

  it("S5.8 AsyncAPI 3: channel messages, operations, servers, security, traits and channel-scoped message refs", async () => {
    const bundled: any = await bundle(
      "a3.json",
      memResolver(asyncapi3).resolver,
    )
    expect(bundled.servers.prod.$ref).toBe("#/components/servers/Prod")
    expect(bundled.channels.Ch.messages.M.payload.$ref).toBe(
      "#/components/schemas/User",
    )
    expect(bundled.channels.Ch.messages.M.headers.$ref).toBe(
      "#/components/schemas/H",
    )
    expect(bundled.channels.Ch.servers[0].$ref).toBe("#/servers/prod")
    expect(bundled.channels.Ch.parameters.id.$ref).toBe(
      "#/components/parameters/Id",
    )
    expect(bundled.channels.ExtCh.address).toBe("ext")
    expect(bundled.operations.Op.channel.$ref).toBe("#/channels/Ch")
    expect(bundled.operations.Op.messages[0].$ref).toBe(
      "#/channels/Ch/messages/M",
    )
    expect(bundled.operations.Op.reply.channel.$ref).toBe("#/channels/ExtCh")
    expect(bundled.operations.Op.reply.messages[0].$ref).toBe(
      "#/channels/ExtCh/messages/E",
    )
    expect(bundled.operations.Op.security[0].$ref).toBe(
      "#/components/securitySchemes/k",
    )
    expect(bundled.operations.Op.traits[0].$ref).toBe(
      "#/components/operationTraits/T",
    )
    expect(bundled.operations.ExtOp.action).toBe("receive")
    expect(bundled.operations.ExtOp.channel.$ref).toBe("#/channels/ExtCh")
    expect(bundled.components.securitySchemes.k).toEqual({
      type: "apiKey",
      in: "user",
    })
    expectAllRefsInternalAndResolvable(bundled)
  })

  it("S5.9 JSON Schema: subschema keywords are hoisted into definitions and 2019-09+ keywords still produce a valid document", async () => {
    const doc = {
      "r.json": {
        type: "object",
        not: { $ref: "x.json" },
        allOf: [{ $ref: "x.json" }],
        anyOf: [{ $ref: "x.json" }],
        oneOf: [{ $ref: "x.json" }],
        items: { $ref: "x.json" },
        additionalProperties: { $ref: "x.json" },
        properties: { p: { $ref: "x.json" } },
        definitions: { d: { $ref: "x.json" } },
        patternProperties: { "^x": { $ref: "y.json" } },
        if: { $ref: "y.json" },
        // oxlint-disable-next-line unicorn/no-thenable -- JSON Schema keyword
        then: { $ref: "y.json" },
        prefixItems: [{ $ref: "y.json" }],
        dependentSchemas: { a: { $ref: "y.json" } },
        unevaluatedProperties: { $ref: "y.json" },
      },
      "x.json": { title: "x" },
      "y.json": {
        type: "object",
        properties: { inner: { $ref: "#/$defs/I" } },
        $defs: { I: { type: "string" } },
      },
    }
    const bundled: any = await bundle("r.json", memResolver(doc).resolver)
    // definitions.d is a pure alias of x.json, so it is reused as the single definition
    const nodes = [
      bundled.not,
      bundled.allOf[0],
      bundled.anyOf[0],
      bundled.oneOf[0],
      bundled.items,
      bundled.additionalProperties,
      bundled.properties.p,
    ]
    for (const node of nodes) {
      expect(node).toEqual({ $ref: "#/definitions/d" })
    }
    expect(bundled.definitions.d).toEqual({ title: "x" })
    expect(Object.keys(bundled.definitions)).toEqual(["d"])
    expectAllRefsInternalAndResolvable(bundled)
  })

  it("S5.10 document type detection follows the version fields and JSON Schema heuristics", () => {
    expect(calcJsonType({ openapi: "3.0.3" })).toBe("OpenApi3")
    expect(calcJsonType({ openapi: "3.1.0" })).toBe("OpenApi3")
    expect(calcJsonType({ swagger: "2.0" })).toBe("OpenApi2")
    expect(calcJsonType({ asyncapi: "2.6.0" })).toBe("AsyncApi2")
    expect(calcJsonType({ asyncapi: "3.0.0" })).toBe("AsyncApi3")
    expect(calcJsonType({ type: "object" })).toBe("JsonSchema")
    expect(calcJsonType({ properties: {} })).toBe("JsonSchema")
    expect(calcJsonType({ definitions: {} })).toBe("JsonSchema")
    expect(calcJsonType({ oneOf: [] })).toBe("JsonSchema")
    expect(calcJsonType({ foo: 1 })).toBe("unknown")
    expect(calcJsonType(null as any)).toBe("unknown")
  })

  // ISSUE-RB-21: isBasicJsonSchema() only looks at type/definitions/properties, so documents identified by $schema or $defs are classified as "unknown" and bundled by inlining.
  it("S5.10b documents declaring $schema or $defs are detected as JSON Schema", () => {
    expect(
      calcJsonType({ $schema: "https://json-schema.org/draft/2020-12/schema" }),
    ).toBe("JsonSchema")
    expect(calcJsonType({ $defs: {} })).toBe("JsonSchema")
  })

  it("S5.11 OpenAPI literal values keep a $ref member as data, without loading or reporting it", async () => {
    const data = { $ref: "./data.json" }
    const doc = {
      "openapi.json": {
        openapi: "3.1.0",
        info: { title: "t", version: "1" },
        paths: {
          "/t": {
            get: {
              responses: {
                "200": {
                  description: "ok",
                  content: {
                    "application/json": {
                      examples: { Ex: { value: data, dataValue: data } },
                      schema: { type: "object", enum: [data], const: data },
                    },
                  },
                  links: {
                    L: {
                      operationId: "x",
                      parameters: { p: data },
                      requestBody: data,
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          securitySchemes: {
            o: {
              type: "oauth2",
              flows: {
                implicit: {
                  authorizationUrl: "https://a.test",
                  scopes: { $ref: "read" },
                },
              },
            },
          },
        },
      },
    }
    const { resolver, calls } = memResolver(doc)
    const errors: string[] = []
    for (const run of [bundle, dereference]) {
      const result: any = await run("openapi.json", resolver, {
        hooks: { onError: (message: string) => errors.push(message) },
      })
      expect(result).toEqual(doc["openapi.json"])
    }
    expect(errors).toEqual([])
    expect(calls).toEqual(["openapi.json", "openapi.json"])
  })

  it("S5.12 annotations (example, examples, default) are resolved and inlined; enum and AsyncAPI message examples stay literal", async () => {
    const doc = {
      "openapi.json": {
        openapi: "3.0.0",
        info: { title: "t", version: "1" },
        paths: {
          "/t": {
            get: {
              responses: {
                "200": {
                  description: "ok",
                  content: {
                    "application/json": {
                      example: { $ref: "data.json" },
                      schema: {
                        type: "object",
                        example: { $ref: "data.json" },
                        default: { $ref: "data.json" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "data.json": { id: 123 },
      "schema.json": {
        $schema: "http://json-schema.org/draft-07/schema#",
        definitions: { s: { type: "string" } },
        enum: [{ $ref: "#/definitions/s" }],
        examples: [{ $ref: "#/definitions/s" }],
      },
      "asyncapi.json": {
        asyncapi: "2.6.0",
        info: { title: "t", version: "1" },
        channels: {
          c: {
            publish: {
              message: {
                payload: { type: "object" },
                examples: [{ payload: { $ref: "x.json" } }],
              },
            },
          },
        },
      },
    }
    const errors: string[] = []
    const hooks = { onError: (message: string) => errors.push(message) }
    const openapi: any = await bundle(
      "openapi.json",
      memResolver(doc).resolver,
      { hooks },
    )
    expectAllRefsInternalAndResolvable(openapi)
    const media =
      openapi.paths["/t"].get.responses["200"].content["application/json"]
    // one copy of the content, the other annotations point at it
    expect(media.example).toEqual({ id: 123 })
    expect(resolveInternal(openapi, media.schema.example.$ref)).toEqual({
      id: 123,
    })
    expect(resolveInternal(openapi, media.schema.default.$ref)).toEqual({
      id: 123,
    })

    const schema: any = await dereference(
      "schema.json",
      memResolver(doc).resolver,
      { hooks },
    )
    expect(schema.enum).toEqual([{ $ref: "#/definitions/s" }])
    expect(schema.examples).toEqual([{ type: "string" }])

    const asyncapi: any = await bundle(
      "asyncapi.json",
      memResolver(doc).resolver,
      { hooks },
    )
    expect(asyncapi).toEqual(doc["asyncapi.json"])
    expect(errors).toEqual([])
  })
})
