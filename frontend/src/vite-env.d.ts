/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_JITSI_DOMAIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
