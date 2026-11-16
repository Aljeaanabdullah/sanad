// Sanad (PRD 4.7): an ECDSA P-256 signing key in the Android Keystore (StrongBox when the phone has it).
// The key never leaves the secure hardware, signs only after a strong biometric (fingerprint / secure face,
// not the passcode), and is invalidated when a new fingerprint or face is added to the phone.
// Key creation also returns the Key Attestation certificate chain for the server's nonce.
package expo.modules.sanaddevicekey

import android.content.pm.PackageManager
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.launch
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec

private const val KEYSTORE = "AndroidKeyStore"

class SanadDeviceKeyModule : Module() {
  private var signing = false

  override fun definition() = ModuleDefinition {
    Name("SanadDeviceKey")

    AsyncFunction("hasKey") { alias: String ->
      keyStore().containsAlias(alias)
    }

    AsyncFunction("deleteKey") { alias: String ->
      val ks = keyStore()
      if (ks.containsAlias(alias)) ks.deleteEntry(alias)
    }

    AsyncFunction("generateKey") { alias: String, challenge: String, promise: Promise ->
      try {
        val ks = keyStore()
        if (ks.containsAlias(alias)) ks.deleteEntry(alias)
        val context = appContext.reactContext ?: throw IllegalStateException("no context")
        val strongBox = Build.VERSION.SDK_INT >= 28 &&
          context.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)
        try {
          generate(alias, challenge, strongBox)
        } catch (e: Exception) {
          // StrongBox is listed but refused this key (some phones): use the TEE.
          if (!strongBox) throw e
          if (ks.containsAlias(alias)) ks.deleteEntry(alias)
          generate(alias, challenge, false)
        }
        val chain = ks.getCertificateChain(alias)?.map { Base64.encodeToString(it.encoded, Base64.NO_WRAP) } ?: emptyList()
        val publicKey = ks.getCertificate(alias).publicKey.encoded
        promise.resolve(
          mapOf(
            "publicKey" to Base64.encodeToString(publicKey, Base64.NO_WRAP),
            "attestation" to chain,
          )
        )
      } catch (e: IllegalStateException) {
        // "At least one biometric must be enrolled" / no secure lock screen.
        promise.reject("not_enrolled", e.message, e)
      } catch (e: Exception) {
        promise.reject("generate_failed", e.message, e)
      }
    }

    // Resolves { ok: true, signature } (base64 DER) or { ok: false, error }; error codes match
    // expo-local-authentication where they overlap (user_cancel, lockout, not_enrolled, ...).
    AsyncFunction("sign") { alias: String, payload: String, title: String, cancel: String, promise: Promise ->
      val activity = appContext.currentActivity as? FragmentActivity
      if (activity == null) {
        promise.resolve(failure("unknown"))
        return@AsyncFunction
      }
      val key = try {
        keyStore().getKey(alias, null) as? PrivateKey
      } catch (e: Exception) {
        null
      }
      if (key == null) {
        promise.resolve(failure("no_key"))
        return@AsyncFunction
      }
      val signature = Signature.getInstance("SHA256withECDSA")
      try {
        signature.initSign(key)
      } catch (e: KeyPermanentlyInvalidatedException) {
        // A fingerprint or face was added (or all removed): this key is gone for good.
        promise.resolve(failure("key_invalidated"))
        return@AsyncFunction
      } catch (e: Exception) {
        promise.resolve(failure("unknown"))
        return@AsyncFunction
      }

      appContext.mainQueue.launch {
        if (signing) {
          promise.resolve(failure("app_cancel"))
          return@launch
        }
        signing = true
        val callback = object : BiometricPrompt.AuthenticationCallback() {
          override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
            signing = false
            try {
              val s = result.cryptoObject?.signature ?: throw IllegalStateException("no signature")
              s.update(payload.toByteArray(Charsets.UTF_8))
              promise.resolve(mapOf("ok" to true, "signature" to Base64.encodeToString(s.sign(), Base64.NO_WRAP)))
            } catch (e: Exception) {
              promise.resolve(failure("unknown"))
            }
          }

          override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
            signing = false
            promise.resolve(failure(errorName(errorCode)))
          }
          // onAuthenticationFailed: one wrong finger / face; the prompt stays open and the user tries again.
        }
        try {
          val prompt = BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), callback)
          val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setNegativeButtonText(cancel)
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build()
          prompt.authenticate(info, BiometricPrompt.CryptoObject(signature))
        } catch (e: Exception) {
          signing = false
          promise.resolve(failure("unknown"))
        }
      }
    }
  }

  private fun keyStore(): KeyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }

  private fun generate(alias: String, challenge: String, strongBox: Boolean) {
    val builder = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
      .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
      .setDigests(KeyProperties.DIGEST_SHA256)
      .setUserAuthenticationRequired(true)
      .setInvalidatedByBiometricEnrollment(true)
      .setAttestationChallenge(challenge.toByteArray(Charsets.UTF_8))
    if (Build.VERSION.SDK_INT >= 30) {
      // Every signature needs its own biometric check; the passcode cannot unlock the key.
      builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
    } else {
      @Suppress("DEPRECATION")
      builder.setUserAuthenticationValidityDurationSeconds(-1)
    }
    if (strongBox && Build.VERSION.SDK_INT >= 28) builder.setIsStrongBoxBacked(true)
    val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, KEYSTORE)
    generator.initialize(builder.build())
    generator.generateKeyPair()
  }

  private fun failure(error: String) = mapOf("ok" to false, "error" to error)

  private fun errorName(code: Int): String = when (code) {
    BiometricPrompt.ERROR_USER_CANCELED, BiometricPrompt.ERROR_NEGATIVE_BUTTON -> "user_cancel"
    BiometricPrompt.ERROR_CANCELED -> "system_cancel"
    BiometricPrompt.ERROR_LOCKOUT, BiometricPrompt.ERROR_LOCKOUT_PERMANENT -> "lockout"
    BiometricPrompt.ERROR_NO_BIOMETRICS, BiometricPrompt.ERROR_HW_NOT_PRESENT, BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL -> "not_enrolled"
    BiometricPrompt.ERROR_HW_UNAVAILABLE -> "not_available"
    BiometricPrompt.ERROR_TIMEOUT -> "timeout"
    else -> "unknown"
  }
}
