// Expected output after bundle() for sibling-content.yaml
// Sibling properties are preserved alongside $ref for internal refs

export default {
  asyncapi: '3.0.0',
  info: {
    title: 'AsyncAPI v3 Sibling Content Test',
    version: '1.0.0',
    description: 'Tests $ref with sibling properties (description, title, etc.)'
  },
  channels: {
    UserChannel: {
      address: '/users',
      messages: {
        UserCreated: {
          // EDG-SIB-001: $ref with description sibling - preserved
          $ref: '#/components/messages/BaseUserMessage',
          description: 'User creation event with additional context'
        },
        UserUpdated: {
          // EDG-SIB-002: $ref with multiple sibling properties - preserved
          $ref: '#/components/messages/BaseUserMessage',
          description: 'User update event',
          summary: 'Fired when user profile is updated',
          title: 'UserUpdatedEvent'
        }
      }
    }
  },
  operations: {
    CreateUser: {
      action: 'send',
      channel: {
        $ref: '#/channels/UserChannel'
      },
      messages: [
        { $ref: '#/channels/UserChannel/messages/UserCreated' }
      ]
    }
  },
  components: {
    schemas: {
      BaseUser: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' }
        }
      },
      ExtendedUser: {
        // EDG-SIB-002: Schema $ref with sibling properties - preserved
        $ref: '#/components/schemas/BaseUser',
        description: 'Extended user with additional metadata',
        title: 'ExtendedUserSchema'
      },
      UserWithEmail: {
        // EDG-SIB-002: $ref with additional schema properties
        $ref: '#/components/schemas/BaseUser',
        properties: {
          email: {
            type: 'string',
            format: 'email'
          }
        }
      }
    },
    messages: {
      BaseUserMessage: {
        payload: {
          $ref: '#/components/schemas/BaseUser'
        },
        contentType: 'application/json'
      }
    }
  }
}
