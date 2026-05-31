import WebSocket from 'ws'

const TOKEN = '8880e2d8613a477ad441c375c7e81c507770b0d02cc4bea3'

function test() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:18789', {
      perMessageDeflate: false,
      headers: {}
    })

    let reqSeq = 0
    const getNextSeq = () => ++reqSeq

    ws.on('open', () => {
      console.log('✓ Connected')
    })

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      console.log('←', JSON.stringify({ type: msg.type, event: msg.event }))

      // Step 1: Handle challenge
      if (msg.type === 'event' && msg.event === 'connect.challenge') {
        console.log('→ Sending connect (minimal)')

        ws.send(JSON.stringify({
          type: 'req',
          id: getNextSeq(),
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 4,
            client: {
              id: 'cli',
              version: '1.0.0',
              platform: 'node',
              mode: 'operator'
            },
            role: 'operator',
            scopes: ['operator.read', 'operator.write'],
            auth: {
              token: TOKEN
            }
          }
        }))
        return
      }

      // Step 2: Connected
      if (msg.type === 'res' && msg.payload?.type === 'hello-ok') {
        console.log('✓ Authenticated!')
        
        // Step 3: Send health check
        ws.send(JSON.stringify({
          type: 'req',
          id: getNextSeq(),
          method: 'health',
          params: {}
        }))
        return
      }

      // Step 4: Health response
      if (msg.type === 'res' && msg.payload) {
        console.log('✓ Health check success!')
        console.log('  Protocol:', msg.payload.protocol)
        console.log('  Server:', msg.payload.server?.version)
        ws.close()
        resolve('ok')
        return
      }

      if (msg.type === 'res' && !msg.ok) {
        ws.close()
        reject(new Error(msg.error || 'Unknown error'))
      }
    })

    ws.on('error', (error) => {
      reject(new Error(`WebSocket error: ${error.message}`))
    })

    ws.on('close', (code, reason) => {
      if (code !== 1000) {
        reject(new Error(`Closed: ${code} ${reason.toString()}`))
      }
    })
  })
}

test()
  .then(() => {
    console.log('✓ Test passed!')
    process.exit(0)
  })
  .catch((err) => {
    console.error('✗ Test failed:', err.message)
    process.exit(1)
  })