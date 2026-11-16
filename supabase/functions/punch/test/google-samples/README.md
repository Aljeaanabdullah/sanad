Real Android Key Attestation chain (EC key, TEE, ending in Google's RSA root), copied from Google's
sample data: https://github.com/google/android-key-attestation/tree/master/src/test/resources/pem/algorithm_EC_SecurityLevel_TEE
(Apache License 2.0). Used by attestation.test.mjs to check the parser on real data. The sample key does not
require biometrics, so the check must refuse it with `attestation_no_biometric` after every other step passes.
