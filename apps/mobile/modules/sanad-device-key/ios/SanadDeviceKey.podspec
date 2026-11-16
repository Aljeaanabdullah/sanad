Pod::Spec.new do |s|
  s.name           = 'SanadDeviceKey'
  s.version        = '0.1.0'
  s.summary        = 'Sanad: signing key in the Secure Enclave, unlocked by Face ID / Touch ID (PRD 4.7).'
  s.description    = s.summary
  s.license        = 'UNLICENSED'
  s.author         = 'Sanad'
  s.homepage       = 'https://github.com/'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
