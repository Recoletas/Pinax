<template>
  <router-view />
</template>

<script setup>
import { onMounted } from 'vue'
import { useTheme } from './composables/useTheme'

const { initTheme } = useTheme()
onMounted(() => {
  initTheme()
})
</script>

<style>
/* Global app styles are in main.css */
</style>