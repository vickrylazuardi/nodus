/// <reference types="vite/client" />

/**
 * Build-time environment.
 *
 * Vite inlines these at build time, so a change requires a rebuild. Only
 * variables prefixed with VITE_ are exposed to the browser, which is why the
 * API base is named VITE_API_BASE_URL: it is public by definition and must
 * never hold a secret.
 */
interface ImportMetaEnv {
  /**
   * Absolute API origin in production, e.g.
   * "https://nodus-0qo0.onrender.com/api". Unset in development, where the
   * Vite proxy handles "/api" and keeps the browser on one origin.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
