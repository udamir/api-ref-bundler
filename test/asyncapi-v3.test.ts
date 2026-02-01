import { bundle, dereference } from "../src"
import { resolver } from "./helpers"

import asyncApiV3 from "./specs/asyncapi-v3"
import asyncApiV3External from "./specs/asyncapi-v3-external"
import asyncApiV3Comprehensive from "./specs/asyncapi-v3-comprehensive"
import asyncApiV3Circular from "./specs/asyncapi-v3-circular"
import asyncApiV3Edge from "./specs/asyncapi-v3-edge"
import asyncApiV3TraitsBindings from "./specs/asyncapi-v3-traits-bindings"

describe("AsyncAPI v3 tests", () => {

  describe("AsyncAPI v3 with channel-scoped message references", () => {
    it("should bundle successfully and preserve channel-scoped message refs", async () => {
      const schema = await bundle("specs/asyncapi-v3/asyncapi-v3.yaml", resolver)
      expect(schema).toMatchObject(asyncApiV3.bundled)
      expect(schema.operations.SendText.messages[0].$ref).toBe('#/channels/SpeakChannel/messages/TextInput')
      expect(schema.operations.ReceiveAudio.messages[0].$ref).toBe('#/channels/SpeakChannel/messages/AudioOutput')
    })

    it("should dereference successfully", async () => {
      const schema: any = await dereference("specs/asyncapi-v3/asyncapi-v3.yaml", resolver)
      expect(schema).toMatchObject(asyncApiV3.dereferenced)
      expect(schema.operations.SendText.messages[0]).toHaveProperty('payload')
      expect(schema.operations.ReceiveAudio.messages[0]).toHaveProperty('payload')
    })
  })

  describe("AsyncAPI v3 with external file references", () => {
    it("should bundle external refs successfully", async () => {
      const schema: any = await bundle("specs/asyncapi-v3-external/asyncapi-v3-external.yaml", resolver)
      expect(schema).toMatchObject(asyncApiV3External.bundled)
      // Verify external schemas are bundled into components
      expect(schema.components.schemas.TextPayload).toBeDefined()
      // Verify external messages are bundled
      expect(schema.components.messages.GenericTextMessage).toBeDefined()
      // Verify channel message refs are internal
      expect(schema.channels.SpeakChannel.messages.TextInput.$ref).toBe('#/components/messages/GenericTextMessage')
      // Verify operation channel refs are internal
      expect(schema.operations.SendText.channel.$ref).toBe('#/channels/SpeakChannel')
      // Verify operation message refs preserve channel-scoped path
      expect(schema.operations.SendText.messages[0].$ref).toBe('#/channels/SpeakChannel/messages/TextInput')
    })

    it("should dereference external refs successfully", async () => {
      const schema: any = await dereference("specs/asyncapi-v3-external/asyncapi-v3-external.yaml", resolver)
      expect(schema).toMatchObject(asyncApiV3External.dereferenced)
      // Verify all refs are resolved
      expect(schema.components.schemas.TextPayload.type).toBe('object')
      expect(schema.components.messages.GenericTextMessage.payload.type).toBe('object')
      expect(schema.channels.SpeakChannel.messages.TextInput.payload.type).toBe('object')
      expect(schema.operations.SendText.channel.address).toBe('/v1/speak')
      expect(schema.operations.SendText.messages[0].payload).toBeDefined()
    })
  })

  describe("AsyncAPI v3 comprehensive - all component types", () => {
    it("should bundle comprehensive spec with all component types", async () => {
      const schema: any = await bundle("specs/asyncapi-v3-comprehensive/asyncapi-v3-comprehensive.yaml", resolver)
      expect(schema).toMatchObject(asyncApiV3Comprehensive.bundled)

      // Verify server refs are preserved
      expect(schema.servers.production.variables.version.$ref).toBe('#/components/serverVariables/apiVersion')
      expect(schema.servers.production.security[0].$ref).toBe('#/components/securitySchemes/apiKey')
      expect(schema.servers.production.tags[0].$ref).toBe('#/components/tags/production')
      expect(schema.servers.production.externalDocs.$ref).toBe('#/components/externalDocs/serverDocs')

      // Verify channel refs are preserved
      expect(schema.channels.UserChannel.servers[0].$ref).toBe('#/servers/production')
      expect(schema.channels.UserChannel.parameters.userId.$ref).toBe('#/components/parameters/userId')
      expect(schema.channels.UserChannel.messages.UserCreated.headers.$ref).toBe('#/components/schemas/MessageHeaders')
      expect(schema.channels.UserChannel.messages.UserCreated.payload.$ref).toBe('#/components/schemas/User')
      expect(schema.channels.UserChannel.messages.UserCreated.correlationId.$ref).toBe('#/components/correlationIds/default')
      expect(schema.channels.UserChannel.messages.UserCreated.traits[0].$ref).toBe('#/components/messageTraits/commonHeaders')
      expect(schema.channels.UserChannel.tags[0].$ref).toBe('#/components/tags/users')
      expect(schema.channels.UserChannel.externalDocs.$ref).toBe('#/components/externalDocs/channelDocs')

      // Verify operation refs are preserved
      expect(schema.operations.CreateUser.channel.$ref).toBe('#/channels/UserChannel')
      expect(schema.operations.CreateUser.messages[0].$ref).toBe('#/channels/UserChannel/messages/UserCreated')
      expect(schema.operations.CreateUser.security[0].$ref).toBe('#/components/securitySchemes/oauth2')
      expect(schema.operations.CreateUser.traits[0].$ref).toBe('#/components/operationTraits/commonOp')
      expect(schema.operations.CreateUser.tags[0].$ref).toBe('#/components/tags/users')
      expect(schema.operations.CreateUser.externalDocs.$ref).toBe('#/components/externalDocs/operationDocs')

      // Verify reply refs are preserved
      expect(schema.operations.CreateUser.reply.address.$ref).toBe('#/components/replyAddresses/default')
      expect(schema.operations.CreateUser.reply.channel.$ref).toBe('#/channels/UserChannel')
      expect(schema.operations.CreateUser.reply.messages[0].$ref).toBe('#/channels/UserChannel/messages/UserUpdated')

      // Verify component refs are preserved
      expect(schema.components.schemas.User.properties.profile.$ref).toBe('#/components/schemas/Profile')
      expect(schema.components.messageTraits.commonHeaders.headers.$ref).toBe('#/components/schemas/MessageHeaders')
      expect(schema.components.messageTraits.commonHeaders.correlationId.$ref).toBe('#/components/correlationIds/default')
      expect(schema.components.operationTraits.commonOp.tags[0].$ref).toBe('#/components/tags/common')
      expect(schema.components.tags.users.externalDocs.$ref).toBe('#/components/externalDocs/tagDocs')
    })

    it("should dereference comprehensive spec with all component types", async () => {
      const schema: any = await dereference("specs/asyncapi-v3-comprehensive/asyncapi-v3-comprehensive.yaml", resolver)
      expect(schema).toMatchObject(asyncApiV3Comprehensive.dereferenced)

      // Verify server refs are dereferenced
      expect(schema.servers.production.variables.version.default).toBe('v1')
      expect(schema.servers.production.security[0].type).toBe('httpApiKey')
      expect(schema.servers.production.tags[0].name).toBe('production')
      expect(schema.servers.production.externalDocs.url).toBe('https://docs.example.com/servers')

      // Verify channel refs are dereferenced
      expect(schema.channels.UserChannel.servers[0].host).toBe('api.example.com')
      expect(schema.channels.UserChannel.parameters.userId.description).toBe('User identifier')
      expect(schema.channels.UserChannel.messages.UserCreated.headers.type).toBe('object')
      expect(schema.channels.UserChannel.messages.UserCreated.payload.type).toBe('object')
      expect(schema.channels.UserChannel.messages.UserCreated.correlationId.location).toBe('$message.header#/correlationId')
      expect(schema.channels.UserChannel.messages.UserCreated.traits[0].headers.type).toBe('object')

      // Verify operation refs are dereferenced
      expect(schema.operations.CreateUser.channel.address).toBe('/users/{userId}')
      expect(schema.operations.CreateUser.messages[0].payload.type).toBe('object')
      expect(schema.operations.CreateUser.security[0].type).toBe('oauth2')
      expect(schema.operations.CreateUser.traits[0].description).toBe('Common operation trait')
      expect(schema.operations.CreateUser.tags[0].name).toBe('users')
      expect(schema.operations.CreateUser.externalDocs.url).toBe('https://docs.example.com/operations')

      // Verify reply refs are dereferenced
      expect(schema.operations.CreateUser.reply.address.location).toBe('$message.header#/replyTo')
      expect(schema.operations.CreateUser.reply.channel.address).toBe('/users/{userId}')
      expect(schema.operations.CreateUser.reply.messages[0].payload.type).toBe('object')

      // Verify nested schema refs are dereferenced
      expect(schema.components.schemas.User.properties.profile.type).toBe('object')
    })
  })

  describe("AsyncAPI v3 with circular schema references", () => {
    it("should bundle with circular schemas", async () => {
      const schema: any = await bundle("specs/asyncapi-v3-circular/circular.yaml", resolver)
      expect(schema).toMatchObject(asyncApiV3Circular.bundled)

      // Verify circular refs are preserved as $refs in bundle
      expect(schema.components.schemas.User.properties.friend.$ref).toBe('#/components/schemas/User')
      expect(schema.components.schemas.Order.properties.customer.$ref).toBe('#/components/schemas/User')
      expect(schema.components.schemas.Review.properties.reviewer.$ref).toBe('#/components/schemas/User')
    })

    it("should dereference with enableCircular: false (preserve circular $refs)", async () => {
      const schema: any = await dereference("specs/asyncapi-v3-circular/circular.yaml", resolver)

      // Verify basic structure is dereferenced
      expect(schema.asyncapi).toBe('3.0.0')
      expect(schema.channels.UserChannel.address).toBe('/users/{userId}')

      // Circular refs point to where User was first dereferenced (channel message payload)
      const circularRefPath = '#/channels/UserChannel/messages/UserMessage/payload'

      // Direct self-reference: User.friend should have $ref
      expect(schema.channels.UserChannel.messages.UserMessage.payload.properties.friend.$ref).toBe(circularRefPath)

      // Verify Order schema is dereferenced with circular ref to User
      expect(schema.components.schemas.Order.type).toBe('object')
      expect(schema.components.schemas.Order.properties.orderId.type).toBe('string')

      // Verify non-circular refs are dereferenced (Order has inline Order structure)
      expect(schema.channels.UserChannel.messages.UserMessage.payload.properties.orders.items.type).toBe('object')
      expect(schema.channels.UserChannel.messages.UserMessage.payload.properties.orders.items.properties.orderId.type).toBe('string')

      // Verify Product and Review are dereferenced
      expect(schema.components.schemas.Product.type).toBe('object')
      expect(schema.components.schemas.Review.type).toBe('object')
    })

    it("should dereference with enableCircular: true (actual circular object references)", async () => {
      const schema: any = await dereference("specs/asyncapi-v3-circular/circular.yaml", resolver, { enableCircular: true })

      // Verify schema structure
      expect(schema.asyncapi).toBe('3.0.0')
      expect(schema.components.schemas.User.type).toBe('object')
      expect(schema.components.schemas.Order.type).toBe('object')
      expect(schema.components.schemas.Review.type).toBe('object')

      // The first dereferenced User is at the channel message payload (canonical location)
      const canonicalUser = schema.channels.UserChannel.messages.UserMessage.payload

      // Verify direct self-reference at canonical location (User.friend === User)
      expect(canonicalUser.properties.friend).toBe(canonicalUser)

      // Components.schemas.User is a separate object, but its friend points to canonical
      expect(schema.components.schemas.User.properties.friend).toBe(canonicalUser)

      // Verify the inline Order's customer field points back to canonical User
      const inlineOrder = canonicalUser.properties.orders.items
      expect(inlineOrder.properties.customer).toBe(canonicalUser)

      // Verify circular reference chain through OrderItem -> Product -> Review -> User
      const inlineOrderItem = inlineOrder.properties.items.items
      const inlineProduct = inlineOrderItem.properties.product
      const inlineReview = inlineProduct.properties.reviews.items
      expect(inlineReview.properties.reviewer).toBe(canonicalUser)
    })
  })

  describe("AsyncAPI v3 edge cases", () => {
    describe("Sibling content with $ref (EDG-SIB-*)", () => {
      it("should preserve sibling properties alongside $ref during bundle", async () => {
        const schema: any = await bundle("specs/asyncapi-v3-edge/sibling-content.yaml", resolver)
        expect(schema).toMatchObject(asyncApiV3Edge.sibling.bundled)

        // EDG-SIB-001: $ref with description sibling
        expect(schema.channels.UserChannel.messages.UserCreated.$ref).toBe('#/components/messages/BaseUserMessage')
        expect(schema.channels.UserChannel.messages.UserCreated.description).toBe('User creation event with additional context')

        // EDG-SIB-002: $ref with multiple sibling properties
        expect(schema.channels.UserChannel.messages.UserUpdated.$ref).toBe('#/components/messages/BaseUserMessage')
        expect(schema.channels.UserChannel.messages.UserUpdated.description).toBe('User update event')
        expect(schema.channels.UserChannel.messages.UserUpdated.title).toBe('UserUpdatedEvent')

        // EDG-SIB-002: Schema $ref with sibling properties
        expect(schema.components.schemas.ExtendedUser.$ref).toBe('#/components/schemas/BaseUser')
        expect(schema.components.schemas.ExtendedUser.description).toBe('Extended user with additional metadata')
        expect(schema.components.schemas.ExtendedUser.title).toBe('ExtendedUserSchema')
      })

      it("should dereference and merge sibling content", async () => {
        const schema: any = await dereference("specs/asyncapi-v3-edge/sibling-content.yaml", resolver)

        // After dereference, the base content is merged with siblings
        expect(schema.channels.UserChannel.messages.UserCreated.payload.type).toBe('object')
        expect(schema.channels.UserChannel.messages.UserCreated.description).toBe('User creation event with additional context')

        // ExtendedUser should have base properties plus its own description/title
        expect(schema.components.schemas.ExtendedUser.type).toBe('object')
        expect(schema.components.schemas.ExtendedUser.description).toBe('Extended user with additional metadata')
      })
    })

    describe("Name collision handling (BND-COL-*)", () => {
      it("should handle name collisions by adding numeric suffix", async () => {
        const schema: any = await bundle("specs/asyncapi-v3-edge/name-collision/main.yaml", resolver)
        expect(schema).toMatchObject(asyncApiV3Edge.nameCollision.bundled)

        // BND-COL-001: Two external files with same schema name
        // First User from schemas-a.yaml gets 'User'
        expect(schema.channels.OrderChannel.messages.OrderMessage.payload.properties.customerFromFileA.$ref)
          .toBe('#/components/schemas/User')
        expect(schema.components.schemas.User.description).toBe('User from file A (customer)')

        // Second User from schemas-b.yaml gets 'User1'
        expect(schema.channels.OrderChannel.messages.OrderMessage.payload.properties.sellerFromFileB.$ref)
          .toBe('#/components/schemas/User1')
        expect(schema.components.schemas.User1.description).toBe('User from file B (seller)')

        // BND-COL-002: External name matches existing component
        // External Product gets 'Product1', original Product unchanged
        expect(schema.channels.OrderChannel.messages.OrderMessage.payload.properties.product.$ref)
          .toBe('#/components/schemas/Product1')
        expect(schema.components.schemas.Product.properties.internalOnly).toBeDefined()
        expect(schema.components.schemas.Product1.properties.externalOnly).toBeDefined()
      })
    })

    describe("Error handling (EDG-ERR-*)", () => {
      it("should preserve invalid refs during bundle without error", async () => {
        const errors: string[] = []
        const schema: any = await bundle("specs/asyncapi-v3-edge/error-cases.yaml", resolver, {
          hooks: {
            onError: (message) => errors.push(message)
          }
        })

        // Bundle does not call onError for unresolved internal refs
        expect(errors.length).toBe(0)

        // Invalid refs are preserved as-is
        expect(schema.channels.ValidChannel.messages.InvalidMessage.payload.$ref)
          .toBe('#/components/schemas/NonExistentSchema')
        expect(schema.operations.InvalidOperation.channel.$ref)
          .toBe('#/channels/NonExistentChannel')
      })

      it("should call onError hook during dereference for invalid refs", async () => {
        const errors: string[] = []
        const schema: any = await dereference("specs/asyncapi-v3-edge/error-cases.yaml", resolver, {
          hooks: {
            onError: (message) => errors.push(message)
          }
        })

        // Dereference calls onError for each unresolved ref
        expect(errors.length).toBeGreaterThan(0)
        expect(errors.some(e => e.includes('NonExistentSchema'))).toBe(true)
        expect(errors.some(e => e.includes('NonExistentChannel'))).toBe(true)
        expect(errors.some(e => e.includes('MissingNestedSchema'))).toBe(true)

        // Invalid refs are preserved with full path
        expect(schema.channels.ValidChannel.messages.InvalidMessage.payload.$ref)
          .toContain('NonExistentSchema')
      })
    })
  })

  describe("AsyncAPI v3 with external traits and bindings", () => {
    it("should bundle external traits and bindings into components", async () => {
      const schema: any = await bundle("specs/asyncapi-v3-traits-bindings/main.yaml", resolver)
      expect(schema).toMatchObject(asyncApiV3TraitsBindings.bundled)

      // Verify external operationTraits are bundled
      expect(schema.operations.SendUser.traits[0].$ref).toBe('#/components/operationTraits/commonOp')
      expect(schema.components.operationTraits.commonOp.description).toBe('Common operation trait from external file')

      // Verify external messageTraits are bundled
      expect(schema.channels.UserChannel.messages.UserMessage.traits[0].$ref).toBe('#/components/messageTraits/commonHeaders')
      expect(schema.components.messageTraits.commonHeaders.contentType).toBe('application/json')

      // Verify external serverBindings are bundled
      expect(schema.servers.production.bindings.$ref).toBe('#/components/serverBindings/websocket')
      expect(schema.components.serverBindings.websocket.ws.method).toBe('GET')

      // Verify external channelBindings are bundled
      expect(schema.channels.UserChannel.bindings.$ref).toBe('#/components/channelBindings/websocket')
      expect(schema.components.channelBindings.websocket.ws.method).toBe('GET')

      // Verify external operationBindings are bundled
      expect(schema.operations.SendUser.bindings.$ref).toBe('#/components/operationBindings/kafka')
      expect(schema.components.operationBindings.kafka.kafka.groupId.type).toBe('string')

      // Verify external messageBindings are bundled
      expect(schema.channels.UserChannel.messages.UserMessage.bindings.$ref).toBe('#/components/messageBindings/kafka')
      expect(schema.components.messageBindings.kafka.kafka.schemaIdLocation).toBe('header')

      // Verify local traits are preserved
      expect(schema.components.operationTraits.localTrait.description).toBe('A local operation trait')
      expect(schema.components.messageTraits.localMessageTrait.contentType).toBe('application/json')
    })

    it("should dereference external traits and bindings", async () => {
      const schema: any = await dereference("specs/asyncapi-v3-traits-bindings/main.yaml", resolver)

      // Verify operationTraits are dereferenced
      expect(schema.operations.SendUser.traits[0].description).toBe('Common operation trait from external file')

      // Verify messageTraits are dereferenced
      expect(schema.channels.UserChannel.messages.UserMessage.traits[0].contentType).toBe('application/json')
      expect(schema.channels.UserChannel.messages.UserMessage.traits[0].headers.type).toBe('object')

      // Verify serverBindings are dereferenced
      expect(schema.servers.production.bindings.ws.method).toBe('GET')

      // Verify channelBindings are dereferenced
      expect(schema.channels.UserChannel.bindings.ws.method).toBe('GET')

      // Verify operationBindings are dereferenced
      expect(schema.operations.SendUser.bindings.kafka.groupId.type).toBe('string')

      // Verify messageBindings are dereferenced
      expect(schema.channels.UserChannel.messages.UserMessage.bindings.kafka.schemaIdLocation).toBe('header')
    })
  })
})

