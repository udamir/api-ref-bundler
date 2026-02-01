export default {
  asyncapi: '3.0.0',
  info: {
    title: 'AsyncAPI v3 External Refs Test',
    version: '1.0.0'
  },
  components: {
    schemas: {
      TextPayload: {
        type: 'object',
        properties: {
          text: {
            type: 'string'
          }
        }
      }
    },
    messages: {
      GenericTextMessage: {
        payload: {
          $ref: '#/components/schemas/TextPayload'
        }
      }
    }
  },
  channels: {
    SpeakChannel: {
      address: '/v1/speak',
      messages: {
        TextInput: {
          $ref: '#/components/messages/GenericTextMessage'
        },
        AudioOutput: {
          payload: {
            type: 'object',
            properties: {
              audio: {
                type: 'string',
                format: 'byte'
              }
            }
          }
        }
      }
    }
  },
  operations: {
    SendText: {
      action: 'send',
      channel: {
        $ref: '#/channels/SpeakChannel'
      },
      messages: [
        { $ref: '#/channels/SpeakChannel/messages/TextInput' }
      ]
    },
    ReceiveAudio: {
      action: 'receive',
      channel: {
        $ref: '#/channels/SpeakChannel'
      },
      messages: [
        { $ref: '#/channels/SpeakChannel/messages/AudioOutput' }
      ]
    }
  }
}
