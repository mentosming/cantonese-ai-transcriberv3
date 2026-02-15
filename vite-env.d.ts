// Removed failing vite/client reference to resolve type definition resolution error

declare module '*.svg' {
  import * as React from 'react';
  export const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement> & { title?: string }>;
}

declare namespace NodeJS {
  interface ProcessEnv {
    readonly API_KEY: string;
    readonly VITE_API_KEY: string;
    readonly GOOGLE_API_KEY: string;
  }
}
