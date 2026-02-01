// Expected output after bundle() for traits and bindings test
// External traits and bindings are bundled into components

export default {
  asyncapi: '3.0.0',
  info: {
    title: 'AsyncAPI v3 Traits and Bindings Test',
    version: '1.0.0',
    description: 'Tests external refs for traits and bindings'
  },
  servers: {
    production: {
      host: 'api.example.com',
      protocol: 'wss',
      bindings: {
        $ref: '#/components/serverBindings/websocket'
      }
    }
  },
  channels: {
    UserChannel: {
      address: '/users',
      bindings: {
        $ref: '#/components/channelBindings/websocket'
      },
      messages: {
        UserMessage: {
          payload: {
            type: 'object',
            properties: {
              id: { type: 'string' }
            }
          },
          traits: [
            { $ref: '#/components/messageTraits/commonHeaders' }
          ],
          bindings: {
            $ref: '#/components/messageBindings/kafka'
          }
        }
      }
    }
  },
  operations: {
    SendUser: {
      action: 'send',
      channel: {
        $ref: '#/channels/UserChannel'
      },
      messages: [
        { $ref: '#/channels/UserChannel/messages/UserMessage' }
      ],
      traits: [
        { $ref: '#/components/operationTraits/commonOp' }
      ],
      bindings: {
        $ref: '#/components/operationBindings/kafka'
      }
    }
  },
  components: {
    operationTraits: {
      localTrait: {
        description: 'A local operation trait'
      },
      commonOp: {
        description: 'Common operation trait from external file',
        tags: [
          {
            name: 'external',
            description: 'From external traits file'
          }
        ],
        externalDocs: {
          url: 'https://docs.example.com/traits'
        }
      }
    },
    messageTraits: {
      localMessageTrait: {
        contentType: 'application/json'
      },
      commonHeaders: {
        headers: {
          type: 'object',
          properties: {
            correlationId: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' }
          }
        },
        contentType: 'application/json',
        description: 'Common message headers from external file'
      }
    },
    serverBindings: {
      websocket: {
        ws: {
          method: 'GET',
          headers: {
            type: 'object',
            properties: {
              Authorization: { type: 'string' }
            }
          }
        }
      }
    },
    channelBindings: {
      websocket: {
        ws: {
          method: 'GET',
          query: {
            type: 'object',
            properties: {
              token: { type: 'string' }
            }
          }
        }
      }
    },
    operationBindings: {
      kafka: {
        kafka: {
          groupId: { type: 'string' },
          clientId: { type: 'string' }
        }
      }
    },
    messageBindings: {
      kafka: {
        kafka: {
          key: { type: 'string' },
          schemaIdLocation: 'header'
        }
      }
    }
  }
}
