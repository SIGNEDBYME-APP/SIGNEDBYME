/**
 * Native binding loader for SIGNEDBYME core.
 *
 * This module loads the C FFI library for the current platform using ffi-napi.
 * The native code is built from Rust and exposes a C-compatible interface.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { platform, arch } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';

// Lazy load ffi-napi to avoid errors if not installed
let ffi: any;
let ref: any;

function loadFfi() {
  if (!ffi) {
    try {
      ffi = require('ffi-napi');
      ref = require('ref-napi');
    } catch (e) {
      throw new Error(
        'ffi-napi is required for native bindings. Install with: npm install ffi-napi ref-napi'
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

// C FFI library instance
let lib: any = null;

function loadLibrary() {
  if (lib) return lib;
  
  loadFfi();
  const libPath = findLibrary();
  
  // Define C FFI function signatures
  lib = ffi.Library(libPath, {
    // Agent lifecycle
    'agent_initialize': ['int', []],
    'agent_initialize_with_path': ['int', ['string']],
    'agent_is_initialized': ['int', []],
    'agent_shutdown': ['int', []],
    
    // Identity
    'agent_get_npub': ['char *', []],
    'agent_get_did': ['char *', []],
    'agent_get_leaf_commitment': ['char *', []],
    
    // Enrollment & Auth
    'agent_enroll': ['int', ['string']],
    'agent_authenticate': ['char *', ['string']],
    'agent_check_delegation': ['int', ['string']],
    
    // Wallet
    'agent_setup_wallet': ['int', ['string']],
    'agent_get_lightning_address': ['char *', []],
    'agent_create_invoice': ['char *', ['uint64', 'string']],
    'agent_pay_invoice': ['char *', ['string']],
    'agent_get_balance': ['int64', []],
    
    // Utilities
    'agent_sdk_version': ['char *', []],
    'agent_string_free': ['void', ['pointer']],
  });
  
  return lib;
}

// Helper to convert C string to JS and free it
function cStringToJs(ptr: any): string | null {
  if (ptr.isNull()) return null;
  const str = ptr.readCString();
  loadLibrary().agent_string_free(ptr);
  return str;
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
      agentNpub = cStringToJs(lib.agent_get_npub());
      
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
      agentNpub = cStringToJs(lib.agent_get_npub());
      agentDid = cStringToJs(lib.agent_get_did());
      
      // Return an agent handle
      return { type: 'agent', storagePath, npub: agentNpub };
    },
  },
  
  getNpub(_client: unknown): string {
    if (!agentNpub) {
      const lib = loadLibrary();
      agentNpub = cStringToJs(lib.agent_get_npub());
    }
    return agentNpub || '';
  },
  
  getAgentNpub(_agent: unknown): string {
    if (!agentNpub) {
      const lib = loadLibrary();
      agentNpub = cStringToJs(lib.agent_get_npub());
    }
    return agentNpub || '';
  },
  
  async generateLoginProof(_client: unknown, clientId: string, _nonce: string): Promise<unknown> {
    const lib = loadLibrary();
    
    // Use agent_authenticate which generates proof internally
    const tokenPtr = lib.agent_authenticate(clientId);
    const token = cStringToJs(tokenPtr);
    
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
    emailMapping = mapping;
  },
  
  async connectRelay(_agent: unknown, _relayUrl: string): Promise<void> {
    // NOSTR relay connection is handled internally by the Rust SDK
    // This is a no-op for now - actual connection happens during auth
  },
  
  subscribeAuthorizations(_agent: unknown): AsyncIterable<string> {
    // Return an async generator that polls for authorization events
    // For now, return empty - this would need WebSocket connection
    return {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            // TODO: Implement actual NOSTR subscription via C FFI
            return { done: true, value: undefined };
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
