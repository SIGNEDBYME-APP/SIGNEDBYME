/**
 * Native binding loader for SIGNEDBYME core.
 *
 * This module loads the C FFI library for the current platform using koffi.
 * The native code is built from Rust and exposes a C-compatible interface.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { platform } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';

// Lazy load koffi to avoid errors if not installed
let koffi: any;

function loadKoffi() {
  if (!koffi) {
    try {
      koffi = require('koffi');
    } catch (e) {
      throw new Error(
        'koffi is required for native bindings. Install with: npm install koffi'
      );
    }
  }
}

// Get native library filename for platform
function getLibraryName(): string {
  const platformName = platform();
  if (platformName === 'linux') return 'libsignedby_sdk.so';
  if (platformName === 'darwin') return 'libsignedby_sdk.dylib';
  if (platformName === 'win32') return 'signedby_sdk.dll';
  throw new Error(`Unsupported platform: ${platformName}`);
}

// Find native library path
function findLibrary(): string {
  const libName = getLibraryName();
  
  // Check in lib directory (downloaded by postinstall)
  const libDir = join(__dirname, '..', 'lib', libName);
  if (existsSync(libDir)) {
    return libDir;
  }
  
  // Check in current directory
  const localPath = join(process.cwd(), libName);
  if (existsSync(localPath)) {
    return localPath;
  }
  
  throw new Error(
    `Native library not found: ${libName}. ` +
    'Run npm install to download binaries, or download manually from: ' +
    'https://github.com/SIGNEDBYME-APP/SIGNEDBYME/releases'
  );
}

// Global agent state (mirrors C FFI global singleton)
let initialized = false;
let agentNpub: string | null = null;
let agentDid: string | null = null;

// C FFI functions
let ffi: {
  agent_initialize: () => number;
  agent_initialize_with_path: (path: string) => number;
  agent_is_initialized: () => number;
  agent_shutdown: () => number;
  agent_get_npub: () => string | null;
  agent_get_did: () => string | null;
  agent_get_leaf_commitment: () => string | null;
  agent_enroll: (clientId: string) => number;
  agent_set_email_mapping: (mappingsJson: string) => number;
  agent_start_enrollment_watcher: (callback: any) => number;
  agent_submit_challenge_code: (clientId: string, email: string, challenge: string) => number;
  agent_authenticate: (clientId: string) => string | null;
  agent_check_delegation: (clientId: string) => number;
  agent_setup_wallet: (nwcUri: string) => number;
  agent_get_lightning_address: () => string | null;
  agent_create_invoice: (amountMsats: bigint, memo: string) => string | null;
  agent_pay_invoice: (invoice: string) => string | null;
  agent_get_balance: () => bigint;
  agent_sdk_version: () => string | null;
  agent_string_free: (ptr: any) => void;
} | null = null;

function loadLibrary() {
  if (ffi) return ffi;
  
  loadKoffi();
  const libPath = findLibrary();
  const lib = koffi.load(libPath);
  
  // Define C FFI function signatures
  ffi = {
    agent_initialize: lib.func('int agent_initialize()'),
    agent_initialize_with_path: lib.func('int agent_initialize_with_path(const char* path)'),
    agent_is_initialized: lib.func('int agent_is_initialized()'),
    agent_shutdown: lib.func('int agent_shutdown()'),
    agent_get_npub: lib.func('const char* agent_get_npub()'),
    agent_get_did: lib.func('const char* agent_get_did()'),
    agent_get_leaf_commitment: lib.func('const char* agent_get_leaf_commitment()'),
    agent_enroll: lib.func('int agent_enroll(const char* client_id)'),
    agent_set_email_mapping: lib.func('int agent_set_email_mapping(const char* mappings_json)'),
    agent_start_enrollment_watcher: lib.func('int agent_start_enrollment_watcher(void* callback)'),
    agent_submit_challenge_code: lib.func('int agent_submit_challenge_code(const char* client_id, const char* email, const char* challenge)'),
    agent_authenticate: lib.func('const char* agent_authenticate(const char* client_id)'),
    agent_check_delegation: lib.func('int agent_check_delegation(const char* client_id)'),
    agent_setup_wallet: lib.func('int agent_setup_wallet(const char* nwc_uri)'),
    agent_get_lightning_address: lib.func('const char* agent_get_lightning_address()'),
    agent_create_invoice: lib.func('const char* agent_create_invoice(uint64_t amount_msats, const char* memo)'),
    agent_pay_invoice: lib.func('const char* agent_pay_invoice(const char* invoice)'),
    agent_get_balance: lib.func('int64_t agent_get_balance()'),
    agent_sdk_version: lib.func('const char* agent_sdk_version()'),
    agent_string_free: lib.func('void agent_string_free(char* ptr)'),
  };
  
  return ffi;
}

/**
 * Native bindings interface that matches what agent.ts and client.ts expect.
 * Implemented using C FFI under the hood.
 */
interface NativeBindings {
  SignedByClient: {
    fromDelegationJson(json: string): Promise<unknown>;
  };
  SignedByAgent: {
    init(storagePath: string): Promise<unknown>;
  };
  getNpub(client: unknown): string;
  getAgentNpub(agent: unknown): string;
  generateLoginProof(client: unknown, clientId: string, nonce: string): Promise<unknown>;
  publishProofEvent(client: unknown, relayUrl: string, proof: unknown): Promise<void>;
  verifyAndGetToken(
    client: unknown,
    apiUrl: string,
    proof: unknown,
    clientId: string,
    nonce: string
  ): Promise<{
    id_token: string;
    token_type?: string;
    expires_in?: number;
    sub: string;
  }>;
  setEmailMapping(agent: unknown, mapping: Record<string, string>): void;
  connectRelay(agent: unknown, relayUrl: string): Promise<void>;
  subscribeAuthorizations(agent: unknown): AsyncIterable<string>;
  getActivityLog(agent: unknown, limit: number): Array<Record<string, unknown>>;
}

// Email mapping storage (in-memory for now)
let emailMapping: Record<string, string> = {};

// Create the native bindings object
const nativeBindings: NativeBindings = {
  SignedByClient: {
    async fromDelegationJson(json: string): Promise<unknown> {
      // Parse delegation and initialize if needed
      const delegation = JSON.parse(json);
      const lib = loadLibrary();
      
      if (!lib.agent_is_initialized()) {
        const result = lib.agent_initialize();
        if (result !== 0) {
          throw new Error(`Failed to initialize agent: error code ${result}`);
        }
      }
      
      initialized = true;
      agentNpub = lib.agent_get_npub();
      
      // Return a client handle (just a marker object)
      return { type: 'client', delegation };
    },
  },
  
  SignedByAgent: {
    async init(storagePath: string): Promise<unknown> {
      const lib = loadLibrary();
      
      const result = lib.agent_initialize_with_path(storagePath);
      if (result !== 0 && result !== -4) { // -4 = already initialized
        throw new Error(`Failed to initialize agent: error code ${result}`);
      }
      
      initialized = true;
      agentNpub = lib.agent_get_npub();
      agentDid = lib.agent_get_did();
      
      // Return an agent handle
      return { type: 'agent', storagePath, npub: agentNpub };
    },
  },
  
  getNpub(_client: unknown): string {
    if (!agentNpub) {
      const lib = loadLibrary();
      agentNpub = lib.agent_get_npub();
    }
    return agentNpub || '';
  },
  
  getAgentNpub(_agent: unknown): string {
    if (!agentNpub) {
      const lib = loadLibrary();
      agentNpub = lib.agent_get_npub();
    }
    return agentNpub || '';
  },
  
  async generateLoginProof(_client: unknown, clientId: string, _nonce: string): Promise<unknown> {
    const lib = loadLibrary();
    
    // Use agent_authenticate which generates proof internally
    const token = lib.agent_authenticate(clientId);
    
    if (!token) {
      throw new Error('Failed to generate login proof');
    }
    
    // Return proof data
    return {
      proof: token,
      clientId,
      npub: agentNpub,
    };
  },
  
  async publishProofEvent(_client: unknown, _relayUrl: string, _proof: unknown): Promise<void> {
    // The C FFI agent_authenticate already publishes the proof event
    // This is a no-op since publishing happens in generateLoginProof
  },
  
  async verifyAndGetToken(
    _client: unknown,
    _apiUrl: string,
    proof: unknown,
    _clientId: string,
    _nonce: string
  ): Promise<{
    id_token: string;
    token_type?: string;
    expires_in?: number;
    sub: string;
  }> {
    // The proof already contains the token from agent_authenticate
    const proofData = proof as { proof: string; npub: string };
    
    return {
      id_token: proofData.proof,
      token_type: 'Bearer',
      expires_in: 3600,
      sub: proofData.npub,
    };
  },
  
  setEmailMapping(_agent: unknown, mapping: Record<string, string>): void {
    const lib = loadLibrary();
    const mappingJson = JSON.stringify(mapping);
    const result = lib.agent_set_email_mapping(mappingJson);
    if (result !== 0) {
      throw new Error(`Failed to set email mapping: error code ${result}`);
    }
    emailMapping = mapping;
  },
  
  async connectRelay(_agent: unknown, _relayUrl: string): Promise<void> {
    // NOSTR relay connection is handled internally by the Rust SDK
    // This is a no-op for now - actual connection happens during auth
  },
  
  submitChallengeCode(_agent: unknown, clientId: string, email: string, challenge: string): void {
    const lib = loadLibrary();
    const result = lib.agent_submit_challenge_code(clientId, email, challenge);
    if (result !== 0) {
      throw new Error(`Failed to submit challenge code: error code ${result}`);
    }
  },
  
  subscribeAuthorizations(_agent: unknown): AsyncIterable<string> {
    const lib = loadLibrary();
    
    // Event queue for async iteration
    const eventQueue: string[] = [];
    let resolveNext: ((value: IteratorResult<string>) => void) | null = null;
    let watcherStarted = false;
    
    return {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<string>> {
            // Start the watcher on first iteration
            if (!watcherStarted) {
              watcherStarted = true;
              
              // Create callback for enrollment events
              // Note: koffi callback registration happens here
              // The callback receives (event_type: int, event_json: string)
              try {
                const callbackType = koffi.callback('void enrollmentCallback(int, const char*)');
                const callbackPtrType = koffi.pointer(callbackType);
                const callback = koffi.register((eventType: number, eventJson: string) => {
                  const event = JSON.stringify({ type: eventType, data: eventJson || '' });
                  if (resolveNext) {
                    resolveNext({ done: false, value: event });
                    resolveNext = null;
                  } else {
                    eventQueue.push(event);
                  }
                  
                  // If event_type is 3 (enrollment complete), signal done
                  if (eventType === 3) {
                    if (resolveNext) {
                      resolveNext({ done: true, value: undefined });
                      resolveNext = null;
                    }
                  }
                }, callbackPtrType);
                
                const result = lib.agent_start_enrollment_watcher(callback);
                if (result !== 0) {
                  return { done: true, value: undefined };
                }
              } catch (e) {
                // Callback registration failed - return done
                console.error('[subscribeAuthorizations] Failed to start watcher:', e);
                return { done: true, value: undefined };
              }
            }
            
            // Return queued event if available
            if (eventQueue.length > 0) {
              return { done: false, value: eventQueue.shift()! };
            }
            
            // Wait for next event
            return new Promise((resolve) => {
              resolveNext = resolve;
            });
          },
        };
      },
    };
  },
  
  getActivityLog(_agent: unknown, _limit: number): Array<Record<string, unknown>> {
    // TODO: Implement via C FFI
    return [];
  },
};

export = nativeBindings;
