/// <reference types="vite/client" />

/** Web Speech API (Chrome / Edge) — не везде в старых lib.dom */
interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

interface SpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null
  onend: ((this: SpeechRecognition, ev: Event) => void) | null
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  readonly results: SpeechRecognitionResultList
}

interface ImportMetaEnv {
  readonly VITE_JITSI_DOMAIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
