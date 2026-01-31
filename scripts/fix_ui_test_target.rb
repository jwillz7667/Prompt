#!/usr/bin/env ruby

# Fix UI Test Target Build Settings
# Run with: ruby scripts/fix_ui_test_target.rb

require 'xcodeproj'

project_path = 'Prompt.xcodeproj'
project = Xcodeproj::Project.open(project_path)

# Find UI test target
ui_test_target = project.targets.find { |t| t.name == 'PromptUITests' }
unless ui_test_target
  puts "Error: Could not find 'PromptUITests' target"
  exit 1
end

# Find main app target for reference
main_target = project.targets.find { |t| t.name == 'Prompt' }
dev_team = main_target&.build_configurations&.first&.build_settings&.dig('DEVELOPMENT_TEAM') || ''

# Fix build settings
ui_test_target.build_configurations.each do |config|
  config.build_settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.res.promptomizer.uitests'
  config.build_settings['TEST_TARGET_NAME'] = 'Prompt'
  config.build_settings['INFOPLIST_FILE'] = 'PromptUITests/Info.plist'
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['CODE_SIGN_STYLE'] = 'Automatic'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  config.build_settings['DEVELOPMENT_TEAM'] = dev_team
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'NO'

  # UI test specific settings
  config.build_settings['LD_RUNPATH_SEARCH_PATHS'] = [
    '$(inherited)',
    '@executable_path/Frameworks',
    '@loader_path/Frameworks'
  ]
end

# Save project
project.save

puts "Fixed PromptUITests target build settings!"
puts "PRODUCT_NAME set to: $(TARGET_NAME)"
