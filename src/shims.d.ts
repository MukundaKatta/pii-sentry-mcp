// Ambient types for @mukundakatta/pii-sentry, which ships as pure JS.
// Mirrors the API documented in the upstream README.
declare module '@mukundakatta/pii-sentry' {
  export type PiiType = 'email' | 'phone' | 'ssn' | 'credit_card' | 'api_key' | string;

  export interface PiiFinding {
    type: PiiType;
    value: string;
    start: number;
    end: number;
  }

  export function detectPii(text: string): PiiFinding[];

  export function redactPii(
    text: string,
    options?: {
      replacement?: string | ((type: PiiType) => string);
    },
  ): string;
}
