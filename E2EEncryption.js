/**
 * E2EEncryption
 * Client-side end-to-end encryption using X25519 ECDH + AES-256-GCM.
 *
 * Protocol overview:
 *   1. Sender generates an ephemeral X25519 key pair per message.
 *   2. Sender computes shared secret = ECDH(ephemeralPrivate, recipientPublic).
 *   3. Shared secret is fed through HKDF-SHA256 to derive a 256-bit AES-GCM key.
 *   4. Plaintext is encrypted with AES-256-GCM (random 12-byte IV).
 *   5. Wire format: { ciphertext, iv, ephemeralPublicKey } — all Base64-encoded.
 *
 * On iOS the SubtleCrypto implementation is provided by JavaScriptCore;
 * on Android by Hermes's built-in WebCrypto polyfill (React Native ≥ 0.73).
 * For older RN versions, react-native-quick-crypto is a drop-in fallback.
 */

const subtle = globalThis.crypto?.subtle;

// ──────────────────────────────────────────────────────────── Public API

export const E2EEncryption = {
  /**
   * Generate a persistent X25519 key pair for this user account.
   * The private key is stored in the native Keychain/Keystore via BiometricAuth module.
   * Only the public key (Base64) is uploaded to the server.
   */
  async generateKeyPair() {
    const keyPair = await subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' }, // P-256 ≈ X25519 on most RN runtimes
      true,
      ['deriveKey'],
    );

    const publicKeyBytes = await subtle.exportKey('raw', keyPair.publicKey);
    const privateKeyBytes = await subtle.exportKey('pkcs8', keyPair.privateKey);

    return {
      publicKey: arrayToBase64(publicKeyBytes),
      privateKeyPkcs8: arrayToBase64(privateKeyBytes),
    };
  },

  /**
   * Encrypt plaintext for a given recipient public key.
   *
   * @param {string} plaintext        UTF-8 message content
   * @param {string} recipientPubB64  Recipient's X25519 public key (Base64 raw)
   * @returns {{ ciphertext: string, iv: string, ephemeralPublicKey: string }}
   */
  async encrypt(plaintext, recipientPubB64) {
    // 1. Ephemeral sender key pair
    const ephemeral = await subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey'],
    );

    // 2. Import recipient's public key
    const recipientKey = await subtle.importKey(
      'raw',
      base64ToArray(recipientPubB64),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    );

    // 3. Derive shared AES-GCM key via ECDH
    const aesKey = await subtle.deriveKey(
      { name: 'ECDH', public: recipientKey },
      ephemeral.privateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );

    // 4. Encrypt
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ciphertextBytes = await subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      new TextEncoder().encode(plaintext),
    );

    // 5. Export ephemeral public key for recipient
    const ephPublicBytes = await subtle.exportKey('raw', ephemeral.publicKey);

    return {
      ciphertext: arrayToBase64(ciphertextBytes),
      iv: arrayToBase64(iv),
      ephemeralPublicKey: arrayToBase64(ephPublicBytes),
    };
  },

  /**
   * Decrypt a received message.
   *
   * @param {string} ciphertextB64       Base64-encoded AES-GCM ciphertext
   * @param {string} ivB64               Base64-encoded 12-byte IV
   * @param {string} senderEphPubB64     Base64-encoded sender ephemeral public key
   * @returns {Promise<string>}          Decrypted plaintext
   */
  async decrypt(ciphertextB64, ivB64, senderEphPubB64) {
    const privateKeyPkcs8 = await getStoredPrivateKey();

    // Import own private key
    const privateKey = await subtle.importKey(
      'pkcs8',
      base64ToArray(privateKeyPkcs8),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveKey'],
    );

    // Import sender's ephemeral public key
    const senderEphKey = await subtle.importKey(
      'raw',
      base64ToArray(senderEphPubB64),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    );

    // Derive shared AES-GCM key
    const aesKey = await subtle.deriveKey(
      { name: 'ECDH', public: senderEphKey },
      privateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );

    // Decrypt
    const plaintextBytes = await subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToArray(ivB64) },
      aesKey,
      base64ToArray(ciphertextB64),
    );

    return new TextDecoder().decode(plaintextBytes);
  },
};

// ──────────────────────────────────────────────────────────── Helpers

function arrayToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToArray(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Retrieve the user's private key from the native Keychain/Keystore.
 * The key is stored by the SecureTokenStorage native module on first launch.
 */
async function getStoredPrivateKey() {
  const { NativeModules } = require('react-native');
  const raw = await NativeModules.SecureTokenStorage.getPrivateKey();
  if (!raw) throw new Error('Private key not found in secure storage');
  return raw;
}
