/**
 * SecureTokenStorage + BiometricAuth
 * Native iOS modules bridged to React Native.
 *
 * SecureTokenStorage: wraps Keychain Services for encrypted token/key persistence.
 * BiometricAuth:      wraps LocalAuthentication for Face ID / Touch ID.
 *
 * Bridging header (SecureChat-Bridging-Header.h) must import:
 *   #import <React/RCTBridgeModule.h>
 *   #import <React/RCTEventEmitter.h>
 */

// ─────────────────────────────────────────────────────────────────────────────
// SecureTokenStorage.swift
// ─────────────────────────────────────────────────────────────────────────────

import Foundation
import Security
import React

@objc(SecureTokenStorage)
class SecureTokenStorage: NSObject, RCTBridgeModule {

  static func moduleName() -> String! { "SecureTokenStorage" }

  // All Keychain calls run on a serial background queue to avoid blocking the JS thread.
  private let queue = DispatchQueue(label: "com.securechat.keychain", qos: .userInitiated)

  private enum Key {
    static let tokens  = "securechat.tokens"
    static let privateKey = "securechat.privateKey"
  }

  // ──────────────────────────────────────────────────── Save tokens

  @objc func saveTokens(_ tokenJSON: String,
                         resolver resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
    queue.async {
      let result = self.keychainSet(key: Key.tokens, value: tokenJSON,
                                    accessibility: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly)
      if result == errSecSuccess {
        resolve(nil)
      } else {
        reject("KEYCHAIN_ERROR", "saveTokens failed: \(result)", nil)
      }
    }
  }

  // ──────────────────────────────────────────────────── Get tokens

  @objc func getTokens(_ resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
    queue.async {
      resolve(self.keychainGet(key: Key.tokens))
    }
  }

  // ──────────────────────────────────────────────────── Delete tokens

  @objc func deleteTokens(_ resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {
    queue.async {
      self.keychainDelete(key: Key.tokens)
      resolve(nil)
    }
  }

  // ──────────────────────────────────────────────────── Private key (PKCS8)

  @objc func savePrivateKey(_ pkcs8B64: String,
                              resolver resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
    queue.async {
      // Store with biometric protection — requires user presence on each access
      let result = self.keychainSet(key: Key.privateKey, value: pkcs8B64,
                                    accessibility: kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
                                    requireBiometric: true)
      if result == errSecSuccess {
        resolve(nil)
      } else {
        reject("KEYCHAIN_ERROR", "savePrivateKey failed: \(result)", nil)
      }
    }
  }

  @objc func getPrivateKey(_ resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
    queue.async {
      resolve(self.keychainGet(key: Key.privateKey))
    }
  }

  // ──────────────────────────────────────────────────── Keychain helpers

  private func keychainSet(key: String, value: String,
                            accessibility: CFString,
                            requireBiometric: Bool = false) -> OSStatus {
    guard let data = value.data(using: .utf8) else { return errSecParam }

    // Delete any existing item first
    keychainDelete(key: key)

    var query: [CFString: Any] = [
      kSecClass:            kSecClassGenericPassword,
      kSecAttrService:      "com.securechat",
      kSecAttrAccount:      key,
      kSecValueData:        data,
      kSecAttrAccessible:   accessibility,
    ]

    if requireBiometric {
      let flags: SecAccessControlCreateFlags = [.userPresence, .privateKeyUsage]
      if let accessControl = SecAccessControlCreateWithFlags(
        nil, accessibility, flags, nil
      ) {
        query[kSecAttrAccessControl] = accessControl
        query.removeValue(forKey: kSecAttrAccessible) // mutually exclusive with AccessControl
      }
    }

    return SecItemAdd(query as CFDictionary, nil)
  }

  private func keychainGet(key: String) -> String? {
    let query: [CFString: Any] = [
      kSecClass:            kSecClassGenericPassword,
      kSecAttrService:      "com.securechat",
      kSecAttrAccount:      key,
      kSecReturnData:       true,
      kSecMatchLimit:       kSecMatchLimitOne,
    ]
    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess,
          let data = result as? Data,
          let string = String(data: data, encoding: .utf8)
    else { return nil }
    return string
  }

  @discardableResult
  private func keychainDelete(key: String) -> OSStatus {
    let query: [CFString: Any] = [
      kSecClass:       kSecClassGenericPassword,
      kSecAttrService: "com.securechat",
      kSecAttrAccount: key,
    ]
    return SecItemDelete(query as CFDictionary)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BiometricAuth.swift
// ─────────────────────────────────────────────────────────────────────────────

import LocalAuthentication

@objc(BiometricAuth)
class BiometricAuth: NSObject, RCTBridgeModule {

  static func moduleName() -> String! { "BiometricAuth" }

  // ──────────────────────────────────────────────────── isEnabled

  @objc func isEnabled(_ resolve: @escaping RCTPromiseResolveBlock,
                        rejecter _reject: @escaping RCTPromiseRejectBlock) {
    let ctx = LAContext()
    var error: NSError?
    let available = ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
    resolve(available)
  }

  // ──────────────────────────────────────────────────── authenticate

  @objc func authenticate(_ options: NSDictionary,
                           resolver resolve: @escaping RCTPromiseResolveBlock,
                           rejecter _reject: @escaping RCTPromiseRejectBlock) {
    let reason       = options["reason"] as? String ?? "Authenticate to continue"
    let fallbackLabel = options["fallbackLabel"] as? String ?? "Use Passcode"

    let ctx = LAContext()
    ctx.localizedFallbackTitle = fallbackLabel

    ctx.evaluatePolicy(
      .deviceOwnerAuthentication, // allows passcode fallback
      localizedReason: reason
    ) { success, error in
      DispatchQueue.main.async {
        if success {
          resolve(["success": true])
        } else {
          let msg = error?.localizedDescription ?? "Authentication failed"
          resolve(["success": false, "error": msg])
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SecureTokenStorageBridge.m   (Objective-C bridging header)
// ─────────────────────────────────────────────────────────────────────────────
/*
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SecureTokenStorage, NSObject)
RCT_EXTERN_METHOD(saveTokens:(NSString *)tokenJSON
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getTokens:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(deleteTokens:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(savePrivateKey:(NSString *)pkcs8B64
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getPrivateKey:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end

@interface RCT_EXTERN_MODULE(BiometricAuth, NSObject)
RCT_EXTERN_METHOD(isEnabled:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(authenticate:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
*/
