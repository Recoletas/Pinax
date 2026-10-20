<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listNarrativeAssets } from '../../services/media/narrativeAssets.js'
const route = useRoute()
const router = useRouter()
const error = ref('')
onMounted(async () => {
  try {
    const asset = route.query.assetId ? listNarrativeAssets({}).find(item => item.id === String(route.query.assetId)) : null
    const bookId = String(route.query.bookId || asset?.projectId || '')
    await router.replace(bookId ? { name: 'authoring', query: { bookId, ...(route.query.assetId ? { legacyAssetId: route.query.assetId } : { tool: 'illustrator' }) } } : { name: 'welcome' })
  } catch { error.value = '暂时无法返回作品，请从左栏重新打开。' }
})
</script>
<template><p role="status">{{ error || '正在打开作品…' }}</p></template>
