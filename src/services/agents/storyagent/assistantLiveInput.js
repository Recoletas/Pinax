import { createBrowserStorageRepository } from '../../storage/browserStorageRepository.js'

export async function sendAssistantLiveInput(taskId, input) {
  const token = createBrowserStorageRepository().getText('pinax_agent_client_capability') || ''
  const response = await fetch(`/api/storyagent/v1/pinax/tasks/${encodeURIComponent(taskId)}/steer`, {
    method: 'POST', signal: AbortSignal.timeout(5000), headers: { 'content-type': 'application/json', 'x-pinax-agent-session': token }, body: JSON.stringify(input)
  })
  if (!response.ok) return { ok: false }
  return response.json()
}
