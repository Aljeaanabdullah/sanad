// Sanad (PRD 4.7): an ECDSA P-256 signing key in the Secure Enclave. The private key never leaves the
// chip, signs only after Face ID / Touch ID (not the passcode), and stops working when the enrolled
// faces / fingers change (.biometryCurrentSet). iPhone gives no attestation for the key itself: the
// server marks it "unattested" until App Attest is added.
import ExpoModulesCore
import LocalAuthentication
import Security

public class SanadDeviceKeyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SanadDeviceKey")

    AsyncFunction("hasKey") { (alias: String) -> Bool in
      return Self.findKey(alias, context: nil) != nil
    }

    AsyncFunction("deleteKey") { (alias: String) in
      Self.delete(alias)
    }

    AsyncFunction("generateKey") { (alias: String, _ challenge: String) throws -> [String: Any] in
      Self.delete(alias)
      var error: Unmanaged<CFError>?
      guard let access = SecAccessControlCreateWithFlags(
        kCFAllocatorDefault,
        kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
        [.privateKeyUsage, .biometryCurrentSet],
        &error
      ) else {
        throw Exception(name: "SanadDeviceKey", description: "No passcode / biometrics for the Secure Enclave key", code: "not_enrolled")
      }
      let attributes: [String: Any] = [
        kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
        kSecAttrKeySizeInBits as String: 256,
        kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
        kSecPrivateKeyAttrs as String: [
          kSecAttrIsPermanent as String: true,
          kSecAttrApplicationTag as String: Self.tag(alias),
          kSecAttrAccessControl as String: access,
        ],
      ]
      guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &error),
            let publicKey = SecKeyCopyPublicKey(key),
            let data = SecKeyCopyExternalRepresentation(publicKey, &error) as Data? else {
        // No passcode set (Secure Enclave keys need one), or no Secure Enclave (simulator).
        throw Exception(name: "SanadDeviceKey", description: "Could not create the Secure Enclave key", code: "generate_failed")
      }
      // 65-byte uncompressed point; the server wraps it into SubjectPublicKeyInfo.
      return ["publicKey": data.base64EncodedString()]
    }

    // Resolves { ok: true, signature } (base64 DER) or { ok: false, error }.
    AsyncFunction("sign") { (alias: String, payload: String, title: String, cancel: String, promise: Promise) in
      let context = LAContext()
      context.localizedCancelTitle = cancel
      context.localizedFallbackTitle = "" // no "Enter Password" button
      context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: title) { success, error in
        guard success else {
          promise.resolve(["ok": false, "error": Self.errorName(error)])
          return
        }
        guard let key = Self.findKey(alias, context: context) else {
          promise.resolve(["ok": false, "error": "no_key"])
          return
        }
        var signError: Unmanaged<CFError>?
        guard let signature = SecKeyCreateSignature(
          key,
          .ecdsaSignatureMessageX962SHA256,
          Data(payload.utf8) as CFData,
          &signError
        ) as Data? else {
          // The enrolled faces / fingers changed: the key cannot be used any more.
          promise.resolve(["ok": false, "error": "key_invalidated"])
          return
        }
        promise.resolve(["ok": true, "signature": signature.base64EncodedString()])
      }
    }
  }

  private static func tag(_ alias: String) -> Data {
    return Data("com.sanad.hr.devicekey.\(alias)".utf8)
  }

  private static func findKey(_ alias: String, context: LAContext?) -> SecKey? {
    var query: [String: Any] = [
      kSecClass as String: kSecClassKey,
      kSecAttrApplicationTag as String: tag(alias),
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      kSecReturnRef as String: true,
    ]
    if let context = context {
      query[kSecUseAuthenticationContext as String] = context
    }
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let found = item else {
      return nil
    }
    return (found as! SecKey)
  }

  private static func delete(_ alias: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassKey,
      kSecAttrApplicationTag as String: tag(alias),
    ]
    SecItemDelete(query as CFDictionary)
  }

  private static func errorName(_ error: Error?) -> String {
    guard let error = error as? LAError else { return "unknown" }
    switch error.code {
    case .userCancel: return "user_cancel"
    case .systemCancel: return "system_cancel"
    case .appCancel: return "app_cancel"
    case .biometryLockout: return "lockout"
    case .biometryNotEnrolled, .passcodeNotSet: return "not_enrolled"
    case .biometryNotAvailable: return "not_available"
    default: return "unknown"
    }
  }
}
