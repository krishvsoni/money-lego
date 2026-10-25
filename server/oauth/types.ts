import "server-only";
import type { ConnectionType } from "@/lib/nodes/types";

// The contract every sign-in provider implements. Adapters only translate between the
// provider's OAuth dialect and these shapes; state, storage, encryption and refresh live
// in one place (flow.ts, store.ts) so every provider gets the same guarantees.

// Everything secret about a connection. Sealed as one JSON value; never leaves the server.
export interface ConnectionSecret {
  accessToken?: string;
  refreshToken?: string;
  // Epoch milliseconds.
  expiresAt?: number;
  webhookUrl?: string;
  extra?: Record<string, string>;
}

export interface Grant {
  account: { id: string; name: string; detail?: string };
  scopes: string[];
  secret: ConnectionSecret;
}

export interface AuthorizeInput {
  state: string;
  redirectUri: string;
  challenge: string;
  shop?: string;
}

export interface ExchangeInput {
  code: string;
  redirectUri: string;
  verifier: string;
  query: URLSearchParams;
  shop?: string;
}

export interface Adapter {
  type: ConnectionType;
  configured(): boolean;
  authorizeUrl(input: AuthorizeInput): string;
  exchange(input: ExchangeInput): Promise<Grant>;
  // Provider-side setup that needs the saved connection, e.g. Shopify's webhook subscription.
  afterConnect?(grant: Grant): Promise<void>;
  refresh?(secret: ConnectionSecret): Promise<ConnectionSecret>;
  // Best effort: give the access back to the provider when the user disconnects.
  revoke?(secret: ConnectionSecret, account: Grant["account"]): Promise<void>;
  // A harmless call proving the connection still works, returning what to show the user.
  probe?(secret: ConnectionSecret, account: Grant["account"]): Promise<string>;
}

export class OAuthError extends Error {
  constructor(message: string, readonly reconnect = false) {
    super(message);
    this.name = "OAuthError";
  }
}
