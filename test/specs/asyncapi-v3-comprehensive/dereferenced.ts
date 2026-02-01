// Helper objects for reuse (simulating reference equality after dereference)
const Profile = {
  type: 'object',
  properties: {
    bio: { type: 'string' },
    avatar: { type: 'string' }
  }
}

const User = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    profile: Profile
  }
}

const MessageHeaders = {
  type: 'object',
  properties: {
    correlationId: { type: 'string' },
    timestamp: { type: 'string', format: 'date-time' }
  }
}

const correlationIdDefault = {
  location: '$message.header#/correlationId',
  description: 'Default correlation ID'
}

const apiKey = {
  type: 'httpApiKey',
  in: 'header',
  name: 'X-API-Key'
}

const oauth2 = {
  type: 'oauth2',
  flows: {
    implicit: {
      authorizationUrl: 'https://example.com/oauth',
      scopes: {
        write: 'Write access',
        read: 'Read access'
      }
    }
  }
}

const apiVersion = {
  default: 'v1',
  enum: ['v1', 'v2'],
  description: 'API version'
}

const parameterUserId = {
  description: 'User identifier',
  schema: { type: 'string' }
}

const serverDocs = {
  url: 'https://docs.example.com/servers',
  description: 'Server documentation'
}

const channelDocs = {
  url: 'https://docs.example.com/channels',
  description: 'Channel documentation'
}

const operationDocs = {
  url: 'https://docs.example.com/operations',
  description: 'Operation documentation'
}

const tagDocs = {
  url: 'https://docs.example.com/tags',
  description: 'Tag documentation'
}

const tagProduction = {
  name: 'production',
  description: 'Production environment'
}

const tagUsers = {
  name: 'users',
  description: 'User operations',
  externalDocs: tagDocs
}

const tagCommon = {
  name: 'common',
  description: 'Common tag'
}

const replyAddressDefault = {
  location: '$message.header#/replyTo',
  description: 'Default reply address'
}

const messageTraitCommonHeaders = {
  headers: MessageHeaders,
  correlationId: correlationIdDefault
}

const operationTraitCommonOp = {
  description: 'Common operation trait',
  tags: [tagCommon]
}

const serverProduction = {
  host: 'api.example.com',
  protocol: 'wss',
  description: 'Production server',
  variables: {
    version: apiVersion
  },
  security: [apiKey],
  tags: [tagProduction],
  externalDocs: serverDocs
}

const messageUserCreated = {
  headers: MessageHeaders,
  payload: User,
  correlationId: correlationIdDefault,
  traits: [messageTraitCommonHeaders]
}

const messageUserUpdated = {
  payload: User
}

const channelUserChannel = {
  address: '/users/{userId}',
  description: 'User events channel',
  servers: [serverProduction],
  parameters: {
    userId: parameterUserId
  },
  messages: {
    UserCreated: messageUserCreated,
    UserUpdated: messageUserUpdated
  },
  tags: [tagUsers],
  externalDocs: channelDocs
}

const replyDefault = {
  channel: channelUserChannel,
  messages: [messageUserUpdated]
}

export default {
  asyncapi: '3.0.0',
  info: {
    title: 'Comprehensive AsyncAPI v3 Test',
    version: '1.0.0',
    description: 'Tests all component types and $ref patterns'
  },
  servers: {
    production: serverProduction
  },
  channels: {
    UserChannel: channelUserChannel
  },
  operations: {
    CreateUser: {
      action: 'send',
      channel: channelUserChannel,
      messages: [messageUserCreated],
      security: [oauth2],
      traits: [operationTraitCommonOp],
      tags: [tagUsers],
      externalDocs: operationDocs,
      reply: {
        address: replyAddressDefault,
        channel: channelUserChannel,
        messages: [messageUserUpdated]
      }
    },
    GetUser: {
      action: 'receive',
      channel: channelUserChannel,
      messages: [messageUserUpdated]
    }
  },
  components: {
    schemas: {
      User: User,
      Profile: Profile,
      MessageHeaders: MessageHeaders
    },
    messages: {
      GenericUserMessage: {
        payload: User,
        correlationId: correlationIdDefault
      }
    },
    securitySchemes: {
      apiKey: apiKey,
      oauth2: oauth2
    },
    serverVariables: {
      apiVersion: apiVersion
    },
    parameters: {
      userId: parameterUserId
    },
    correlationIds: {
      default: correlationIdDefault
    },
    operationTraits: {
      commonOp: operationTraitCommonOp
    },
    messageTraits: {
      commonHeaders: messageTraitCommonHeaders
    },
    replies: {
      default: replyDefault
    },
    replyAddresses: {
      default: replyAddressDefault
    },
    tags: {
      production: tagProduction,
      users: tagUsers,
      common: tagCommon
    },
    externalDocs: {
      serverDocs: serverDocs,
      channelDocs: channelDocs,
      operationDocs: operationDocs,
      tagDocs: tagDocs
    }
  }
}
