/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_TOKEN: string;
  readonly VITE_USER_ID: string;
  readonly VITE_SITE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
