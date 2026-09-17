<script setup>
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  BookOpen,
  Clapperboard,
  ChevronDown,
  LayoutGrid,
  List,
  Compass,
  Download,
  Film,
  Folder,
  Image,
  Menu,
  Moon,
  Sun,
  MessageSquareText,
  MoreHorizontal,
  PanelLeft,
  Palette,
  Pencil,
  Pin,
  RefreshCw,
  Search,
  RotateCcw,
  Network,
  Settings,
  Sparkles,
  Trash2,
  Users,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-vue-next'

const icons = {
  'chevron-down': ChevronDown,
  grid: LayoutGrid,
  list: List,
  archive: Archive,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  'bookmark-plus': BookmarkPlus,
  book: BookOpen,
  compass: Compass,
  download: Download,
  film: Film,
  folder: Folder,
  image: Image,
  menu: Menu,
  moon: Moon,
  sun: Sun,
  'message-square': MessageSquareText,
  more: MoreHorizontal,
  network: Network,
  'panel-left': PanelLeft,
  palette: Palette,
  pencil: Pencil,
  pin: Pin,
  refresh: RefreshCw,
  search: Search,
  'undo-extension': RotateCcw,
  settings: Settings,
  sparkles: Sparkles,
  storyboard: Clapperboard,
  trash: Trash2,
  users: Users,
  close: X,
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
