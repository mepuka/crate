/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Worker URL imports via Vite's ?worker&url suffix
declare module "*?worker&url" {
  const workerUrl: string;
  export default workerUrl;
}
