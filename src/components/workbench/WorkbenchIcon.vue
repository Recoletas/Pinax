<script setup>
import {
  Archive,
  BookmarkPlus,
  BookOpen,
  Clapperboard,
  Compass,
  Download,
  Film,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  RefreshCw,
  RotateCcw,
  Network,
  Settings,
  Sparkles,
  Trash2,
  Users,
  ZoomIn,
  ZoomOut
} from 'lucide-vue-next'

const icons = {
  archive: Archive,
  'bookmark-plus': BookmarkPlus,
  book: BookOpen,
  compass: Compass,
  download: Download,
  film: Film,
  menu: Menu,
  'message-square': MessageSquareText,
  more: MoreHorizontal,
  network: Network,
  'panel-left': PanelLeft,
  pencil: Pencil,
  refresh: RefreshCw,
  'undo-extension': RotateCcw,
  settings: Settings,
  sparkles: Sparkles,
  storyboard: Clapperboard,
  trash: Trash2,
  users: Users,
  'zoom-in': ZoomIn,
  'zoom-out': ZoomOut
}

defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 16 },
  strokeWidth: { type: [Number, String], default: 1.7 }
})
</script>

<template>
  <component
    :is="icons[name] || Sparkles"
    :size="size"
    :stroke-width="strokeWidth"
    aria-hidden="true"
  />
</template>
