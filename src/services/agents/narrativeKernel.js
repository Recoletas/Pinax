import { buildRuntimeCausalityContext } from '../experience/runtimeEventCausality'
import { matchWorldbookEntries } from '../worldbook/worldbookContextBuilder'
import { createNarrativeKernelBuilder } from '@pinax/core/narrative/narrativeKernel'
const shared = createNarrativeKernelBuilder({ buildRuntimeCausalityContext, matchWorldbookEntries })
export const { buildNarrativeKernel } = shared
export default shared.default
