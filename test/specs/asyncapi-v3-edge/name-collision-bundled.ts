// Expected output after bundle() for name-collision/main.yaml
// Name collisions are resolved by adding numeric suffix

export default {
  asyncapi: '3.0.0',
  info: {
    title: 'AsyncAPI v3 Name Collision Test',
    version: '1.0.0',
    description: 'Tests handling of external schemas with same names'
  },
  channels: {
    OrderChannel: {
      address: '/orders',
      messages: {
        OrderMessage: {
          payload: {
            type: 'object',
            properties: {
              // BND-COL-001: First User from schemas-a.yaml gets 'User'
              customerFromFileA: {
                $ref: '#/components/schemas/User'
              },
              // BND-COL-001: Second User from schemas-b.yaml gets 'User1'
              sellerFromFileB: {
                $ref: '#/components/schemas/User1'
              },
              // BND-COL-002: External Product collides with existing, gets 'Product1'
              product: {
                $ref: '#/components/schemas/Product1'
              }
            }
          }
        }
      }
    }
  },
  operations: {
    CreateOrder: {
      action: 'send',
      channel: {
        $ref: '#/channels/OrderChannel'
      },
      messages: [
        { $ref: '#/channels/OrderChannel/messages/OrderMessage' }
      ]
    }
  },
  components: {
    schemas: {
      // Original Product from main.yaml - unchanged
      Product: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          internalOnly: { type: 'boolean' }
        }
      },
      // User from schemas-a.yaml (first occurrence)
      User: {
        type: 'object',
        description: 'User from file A (customer)',
        properties: {
          id: { type: 'string' },
          customerName: { type: 'string' },
          customerEmail: { type: 'string', format: 'email' }
        }
      },
      // User from schemas-b.yaml (collision - gets suffix)
      User1: {
        type: 'object',
        description: 'User from file B (seller)',
        properties: {
          id: { type: 'string' },
          sellerName: { type: 'string' },
          sellerRating: { type: 'number' },
          verified: { type: 'boolean' }
        }
      },
      // Product from schemas-a.yaml (collision with existing - gets suffix)
      Product1: {
        type: 'object',
        description: 'Product from file A (external)',
        properties: {
          id: { type: 'string' },
          productName: { type: 'string' },
          price: { type: 'number' },
          externalOnly: { type: 'boolean' }
        }
      }
    }
  }
}
