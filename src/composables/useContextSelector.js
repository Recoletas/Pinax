import { ref, computed } from 'vue'
import { getWritingContext } from '../services/api'

const selectedSections = ref([])

export function useContextSelector() {
  const sections = [
    { id: 'character', label: '角色' },
    { id: 'time', label: '时间' },
    { id: 'location', label: '地点' },
    { id: 'scene', label: '场景' },
    { id: 'activities', label: '活动' }
  ]

  function isSelected(sectionId) {
    return selectedSections.value.includes(sectionId)
  }

  function toggleSection(sectionId) {
    const idx = selectedSections.value.indexOf(sectionId)
    if (idx === -1) {
      selectedSections.value.push(sectionId)
    } else {
      selectedSections.value.splice(idx, 1)
    }
    saveSelection()
  }

  function getSelectedContext() {
    const contextParts = []
    const allContext = getWritingContext()

    if (isSelected('character')) {
      const charMatch = allContext.match(/【角色】[\s\S]*?(?=【时间】|$)/)
      if (charMatch) contextParts.push(charMatch[0].trim())
    }

    if (isSelected('time')) {
      const timeMatch = allContext.match(/【时间】[\s\S]*?(?=【地点】|$)/)
      if (timeMatch) contextParts.push(timeMatch[0].trim())
    }

    if (isSelected('location')) {
      const locMatch = allContext.match(/【地点】[\s\S]*?(?=【场景】|$)/)
      if (locMatch) contextParts.push(locMatch[0].trim())
    }

    if (isSelected('scene')) {
      const sceneMatch = allContext.match(/【场景】[\s\S]*/)
      if (sceneMatch) contextParts.push(sceneMatch[0].trim())
    }

    if (isSelected('activities')) {
      const actMatch = allContext.match(/【最近活动】[\s\S]*/)
      if (actMatch) contextParts.push(actMatch[0].trim())
    }

    return contextParts.join('\n')
  }

  function saveSelection() {
    localStorage.setItem('context_sections', JSON.stringify(selectedSections.value))
  }

  function loadSelection() {
    const saved = localStorage.getItem('context_sections')
    if (saved) {
      selectedSections.value = JSON.parse(saved)
    }
  }

  return {
    sections,
    selectedSections,
    isSelected,
    toggleSection,
    getSelectedContext,
    loadSelection
  }
}