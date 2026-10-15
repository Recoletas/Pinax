import { createBrowserStorageRepository } from '../../storage/browserStorageRepository.js'
export async function requestAssistantPolicy(action, input, { signal } = {}) {
  const capability = createBrowserStorageRepository().getText('pinax_agent_client_capability') || ''
  const response = await fetch(`/api/storyagent/policies${action ? '/' + action : ''}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-pinax-agent-session': capability }, body: JSON.stringify(input), signal })
  if (!response.ok) throw new Error('助手授权已失效，请重新发送或调整权限。')
  return (await response.json()).policy
}
