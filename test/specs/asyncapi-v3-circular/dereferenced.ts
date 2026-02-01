// Expected output after dereference() with enableCircular: false (default)
// Circular $refs point to where the content was first dereferenced

// Note: The User schema is first encountered via #/channels/UserChannel/messages/UserMessage/payload
// so all circular refs to User point there instead of #/components/schemas/User

const OrderItem: any = {
  type: 'object',
  properties: {
    productId: {
      type: 'string'
    },
    quantity: {
      type: 'integer'
    },
    product: {
      type: 'object',
      properties: {
        id: {
          type: 'string'
        },
        name: {
          type: 'string'
        },
        reviews: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              rating: {
                type: 'integer'
              },
              comment: {
                type: 'string'
              },
              reviewer: {
                // Circular ref - points to first occurrence of User
                $ref: '#/channels/UserChannel/messages/UserMessage/payload'
              }
            }
          }
        }
      }
    }
  }
}

const Order: any = {
  type: 'object',
  properties: {
    orderId: {
      type: 'string'
    },
    amount: {
      type: 'number'
    },
    customer: {
      // Circular ref - points to first occurrence of User
      $ref: '#/channels/UserChannel/messages/UserMessage/payload'
    },
    items: {
      type: 'array',
      items: OrderItem
    }
  }
}

const User: any = {
  type: 'object',
  properties: {
    id: {
      type: 'string'
    },
    name: {
      type: 'string'
    },
    friend: {
      // Direct circular ref to self - points to first occurrence
      $ref: '#/channels/UserChannel/messages/UserMessage/payload'
    },
    orders: {
      type: 'array',
      items: Order
    }
  }
}

const UserMessage: any = {
  payload: User
}

const UserChannel: any = {
  address: '/users/{userId}',
  messages: {
    UserMessage
  }
}

export default {
  asyncapi: '3.0.0',
  info: {
    title: 'AsyncAPI v3 Circular Schema Test',
    version: '1.0.0',
    description: 'Tests circular $ref handling in AsyncAPI v3'
  },
  channels: {
    UserChannel
  },
  operations: {
    GetUser: {
      action: 'receive',
      channel: UserChannel,
      messages: [
        UserMessage
      ]
    }
  },
  components: {
    schemas: {
      User,
      Order,
      OrderItem,
      Product: {
        type: 'object',
        properties: {
          id: {
            type: 'string'
          },
          name: {
            type: 'string'
          },
          reviews: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                rating: {
                  type: 'integer'
                },
                comment: {
                  type: 'string'
                },
                reviewer: {
                  $ref: '#/channels/UserChannel/messages/UserMessage/payload'
                }
              }
            }
          }
        }
      },
      Review: {
        type: 'object',
        properties: {
          rating: {
            type: 'integer'
          },
          comment: {
            type: 'string'
          },
          reviewer: {
            $ref: '#/channels/UserChannel/messages/UserMessage/payload'
          }
        }
      }
    }
  }
}
