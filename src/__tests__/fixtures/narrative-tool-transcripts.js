export const NARRATIVE_TOOL_PROTOCOL_FIXTURES = Object.freeze({
  openAiChat: Object.freeze({
    kind: 'openai-chat-completions',
    response: {
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'chat-call-1',
            type: 'function',
            function: {
              name: 'world_lookup',
              arguments: '{"action":"search","query":"褚岩","limit":3}'
            }
          }]
        }
      }],
      usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 }
    },
    argumentDeltas: [
      { id: 'chat-call-1', argumentsDelta: '{"action":"search",' },
      { id: 'chat-call-1', argumentsDelta: '"query":"褚岩","limit":3}' }
    ]
  }),
  openAiResponses: Object.freeze({
    kind: 'openai-responses',
    response: {
      id: 'resp_fixture_1',
      output: [{
        type: 'function_call',
        call_id: 'responses-call-1',
        name: 'geo_lookup',
        arguments: '{"action":"current"}'
      }],
      status: 'completed',
      usage: { input_tokens: 10, output_tokens: 6, total_tokens: 16 }
    },
    argumentDeltas: [
      { callId: 'responses-call-1', argumentsDelta: '{"action":"current"}' }
    ]
  }),
  anthropicToolUse: Object.freeze({
    kind: 'anthropic-messages',
    response: {
      stop_reason: 'tool_use',
      content: [{
        type: 'tool_use',
        id: 'anthropic-call-1',
        name: 'history_lookup',
        input: { action: 'search', query: '伪装信号', limit: 3 }
      }],
      usage: { input_tokens: 14, output_tokens: 7 }
    },
    argumentDeltas: [
      { id: 'anthropic-call-1', type: 'input_json_delta', partialJson: '{"action":"search",' },
      { id: 'anthropic-call-1', type: 'input_json_delta', partialJson: '"query":"伪装信号","limit":3}' }
    ]
  }),
  minimaxThinking: Object.freeze({
    kind: 'minimax-anthropic-thinking',
    response: {
      stop_reason: 'tool_use',
      content: [
        {
          type: 'thinking',
          thinking: 'fixture reasoning must remain undisplayed',
          signature: 'fixture-signature-only'
        },
        {
          type: 'tool_use',
          id: 'minimax-call-1',
          name: 'memory_lookup',
          input: { action: 'search', query: '纸质日记', limit: 3 }
        }
      ],
      usage: { input_tokens: 18, output_tokens: 11 }
    },
    argumentDeltas: [
      { id: 'minimax-call-1', type: 'input_json_delta', partialJson: '{"action":"search","query":"纸质日记","limit":3}' }
    ]
  }),
  malformedCompatible: Object.freeze({
    kind: 'openai-compatible-malformed',
    response: {
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          tool_calls: [{
            id: 'broken-call-1',
            function: { name: 'world_lookup', arguments: '{"action":' }
          }]
        }
      }]
    },
    argumentDeltas: [
      { id: 'broken-call-1', argumentsDelta: '{"action":' }
    ]
  })
})
