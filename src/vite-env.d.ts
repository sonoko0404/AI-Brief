/// <reference types="vite/client" />

import type { AINewsAPI } from '../shared/types'

declare global {
  interface Window {
    aiNews: AINewsAPI
  }
}

export {}
