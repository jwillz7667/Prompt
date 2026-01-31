#!/usr/bin/env ruby

# Add UI Test Target to Xcode Project
# Run with: ruby scripts/add_ui_test_target.rb

require 'xcodeproj'

project_path = 'Prompt.xcodeproj'
project = Xcodeproj::Project.open(project_path)

# Check if target already exists
existing_target = project.targets.find { |t| t.name == 'PromptUITests' }
if existing_target
  puts "PromptUITests target already exists!"
  exit 0
end

# Find main app target
main_target = project.targets.find { |t| t.name == 'Prompt' }
unless main_target
  puts "Error: Could not find 'Prompt' target"
  exit 1
end

# Create UI test target
ui_test_target = project.new_target(:ui_test_bundle, 'PromptUITests', :ios, '17.0')

# Set bundle identifier and build settings
ui_test_target.build_configurations.each do |config|
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.res.promptomizer.uitests'
  config.build_settings['PRODUCT_NAME'] = 'PromptUITests'
  config.build_settings['TEST_TARGET_NAME'] = 'Prompt'
  config.build_settings['TEST_HOST'] = '$(BUILT_PRODUCTS_DIR)/Prompt.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/Prompt'
  config.build_settings['BUNDLE_LOADER'] = '$(TEST_HOST)'
  config.build_settings['INFOPLIST_FILE'] = 'PromptUITests/Info.plist'
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['CODE_SIGN_STYLE'] = 'Automatic'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  config.build_settings['DEVELOPMENT_TEAM'] = main_target.build_configurations.first.build_settings['DEVELOPMENT_TEAM']
end

# Add test host dependency
ui_test_target.add_dependency(main_target)

# Create group for UI test files
ui_tests_group = project.main_group.find_subpath('PromptUITests', true)
ui_tests_group.set_source_tree('SOURCE_ROOT')
ui_tests_group.set_path('PromptUITests')

# Add source files
['ScreenshotTests.swift', 'SnapshotHelper.swift'].each do |filename|
  file_path = "PromptUITests/#{filename}"
  file_ref = ui_tests_group.new_file(file_path)
  ui_test_target.source_build_phase.add_file_reference(file_ref)
end

# Add Info.plist
info_plist_ref = ui_tests_group.new_file('PromptUITests/Info.plist')

# Create UI test scheme
scheme = Xcodeproj::XCScheme.new
scheme.add_test_target(ui_test_target)
scheme.set_launch_target(main_target)
scheme.save_as(project_path, 'PromptUITests')

# Save project
project.save

puts "Successfully added PromptUITests target!"
puts "Run 'fastlane screenshots' to capture screenshots."
