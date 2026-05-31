import { getAdvice } from './server/services/openclawService.js'

async function test() {
  console.log('Testing OpenClaw WebSocket implementation (correct protocol)...')
  console.log('')

  try {
    const result = await getAdvice(
      '这是一个测试章节。主角陆沉到达暮湾城，遇到了一个神秘的瘸子钟表匠。',
      '请分析当前节奏和人物动机',
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