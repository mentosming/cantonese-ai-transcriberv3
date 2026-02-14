/// <reference types="vite/client" />

declare namespace NodeJS {
  interface ProcessEnv {
    readonly API_KEY: string;
    readonly VITE_API_KEY: string;
    readonly GOOGLE_API_KEY: string;
  }
}
