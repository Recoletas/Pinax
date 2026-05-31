import { getAdvice } from './server/services/openclawService.js'

async function test() {
  console.log('Testing OpenClaw CLI implementation...')
  console.log('')

  try {
    const result = await getAdvice(
      '这是测试上下文',
      '你好',
      { taskType: 'advisor.review.chapter' }
    )

    console.log('✓ Success!')
    console.log('Response:')
    console.log('─'.repeat(60))
    console.log(result)
    console.log('─'.repeat(60))
    console.log(`Length: ${result.length} chars`)
  } catch (error) {
    console.error('✗ Failed:', error.message)
    process.exit(1)
  }
}

test()