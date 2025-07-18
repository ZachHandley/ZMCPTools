/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly DASHBOARD_WS_PORT: string;
  readonly DASHBOARD_API_PORT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}