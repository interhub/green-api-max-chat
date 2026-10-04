/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Fixed API host, for example the mock server. Empty: the host is detected from idInstance. */
  readonly VITE_GREEN_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
