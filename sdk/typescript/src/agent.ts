/**
 * SignedByAgent - Agent initialization and management.
 */

import { mkdirSync, existsSync } from 'fs';
import type { AuthorizationEvent } from './types';
import { RelayConnectionError } from './errors';

// Native binding (loaded via napi-rs)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const native = require('./native');

/**
 * Agent for managing identity and watching for authorization requests.
 *
 * @example
 * ```typescript
 * const agent = await SignedByAgent.init('./agent_data');
 * agent.setEmailMapping({
 *   'amazon.com': 'me@gmail.com',
 *   'acme.com': 'me@gmail.com'
 * });
 * await agent.connectRelay('wss://relay.privacy-lion.com');
 * agent.watchForAuthorizations();
 * ```
 */
export class SignedByAgent {
  private readonly nativeAgent: unknown;
  private relayConnected = false;
  private _emailMapping: Record<string, string> = {};

  private constructor(nativeAgent: unknown) {
    this.nativeAgent = nativeAgent;
  }

  /**
   * Initialize a new agent or load existing identity.
   *
   * Creates DID keys and stores them securely if this is first run.
   * Loads existing identity if storage already exists.
   *
   * @param storagePath - Directory for agent data (keys, witness cache)
   * @returns SignedByAgent instance
   */
  static async init(storagePath: string): Promise<SignedByAgent> {
    if (!existsSync(storagePath)) {
      mkdirSync(storagePath, { recursive: true });
    }

    const nativeAgent = await native.SignedByAgent.init(storagePath);
    return new SignedByAgent(nativeAgent);
  }

  /**
   * Get the agent's npub (public key in bech32 format).
   */
  get npub(): string {
    return native.getAgentNpub(this.nativeAgent);
  }

  /**
   * Set email mapping for enterprises.
   *
   * This tells the agent which email to provide during Gate 1
   * enrollment for each enterprise domain.
   *
   * @param mapping - Dict of enterprise domain -> email address
   */
  setEmailMapping(mapping: Record<string, string>): void {
    this._emailMapping = mapping;
    native.setEmailMapping(this.nativeAgent, mapping);
  }

  /**
   * Connect to a NOSTR relay.
   *
   * @param relayUrl - WebSocket URL of the relay
   */
  async connectRelay(relayUrl: string): Promise<void> {
    try {
      await native.connectRelay(this.nativeAgent, relayUrl);
      this.relayConnected = true;
    } catch (error) {
      throw new RelayConnectionError(`Failed to connect to ${relayUrl}: ${error}`);
    }
  }

  /**
   * Watch for kind 28200 authorization events addressed to this agent.
   *
   * @yields AuthorizationEvent for each incoming authorization request
   */
  async *watchForAuthorizations(): AsyncGenerator<AuthorizationEvent> {
    if (!this.relayConnected) {
      throw new Error('Not connected to relay. Call connectRelay() first.');
    }

    const eventIterator = native.subscribeAuthorizations(this.nativeAgent);

    for await (const eventJson of eventIterator) {
      const event = JSON.parse(eventJson);
      yield {
        enterprise: event.enterprise ?? 'unknown',
        clientId: event.client_id,
        scopes: event.scopes ?? [],
        eventId: event.id,
        createdAt: event.created_at,
      };
    }
  }

  /**
   * Start the enrollment watcher (Option A: SDK handles everything).
   *
   * Per Bible Gates 1-3:
   * 1. Watches for kind 28200 (open session) → auto-responds with kind 28202
   * 2. Watches for kind 28200 (addressed) → waits for human to sign kind 28250
   * 3. Detects kind 28250 → calls /v1/membership/enroll/commit
   *
   * @param onGateComplete - Optional callback for each gate completion
   * @returns Promise that resolves when enrollment completes
   *
   * @example
   * ```typescript
   * const result = await agent.startEnrollmentWatcher((gate, message) => {
   *   console.log(`Gate ${gate}: ${message}`);
   * });
   * if (result.success) {
   *   console.log('Enrolled successfully!');
   * }
   * ```
   */
  async startEnrollmentWatcher(
    onGateComplete?: (gate: number, message: string) => void
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.relayConnected) {
      throw new Error('Not connected to relay. Call connectRelay() first.');
    }

    if (Object.keys(this._emailMapping).length === 0) {
      throw new Error('No email mapping set. Call setEmailMapping() first.');
    }

    return new Promise((resolve) => {
      const eventIterator = native.subscribeAuthorizations(this.nativeAgent);

      (async () => {
        for await (const eventJson of eventIterator) {
          try {
            const event = JSON.parse(eventJson);

            switch (event.type) {
              case 1: // Gate 1 responding
                onGateComplete?.(1, 'Published kind 28202 enrollment response');
                break;
              case 2: // Gate 2 received
                onGateComplete?.(2, 'Received authorization or delegation event');
                break;
              case 3: // Enrollment complete
                onGateComplete?.(3, 'Enrollment complete');
                try {
                  const data = event.data ? JSON.parse(event.data) : {};
                  resolve({ success: data.success ?? true, error: data.error });
                } catch {
                  resolve({ success: true });
                }
                return;
            }
          } catch (e) {
            // Parse error, continue
          }
        }

        // Iterator ended without enrollment complete
        resolve({ success: false, error: 'Enrollment watcher ended unexpectedly' });
      })();
    });
  }

  /**
   * Get recent agent activity (kinds 28101, 28102, 28103).
   *
   * @param limit - Maximum number of events to return
   * @returns List of activity events
   */
  getActivityLog(limit = 100): Array<Record<string, unknown>> {
    return native.getActivityLog(this.nativeAgent, limit);
  }
}
