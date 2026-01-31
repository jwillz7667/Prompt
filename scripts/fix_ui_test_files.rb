#!/usr/bin/env ruby

# Fix UI Test Target File References
# The original script added files with wrong paths (double nested)
# Run with: ruby scripts/fix_ui_test_files.rb

require 'xcodeproj'

project_path = 'Prompt.xcodeproj'
project = Xcodeproj::Project.open(project_path)

# Find UI test target
ui_test_target = project.targets.find { |t| t.name == 'PromptUITests' }
unless ui_test_target
  puts "Error: Could not find 'PromptUITests' target"
  exit 1
end

# Find the PromptUITests group
ui_tests_group = project.main_group.find_subpath('PromptUITests', false)

unless ui_tests_group
  puts "Error: Could not find 'PromptUITests' group"
  exit 1
end

# Remove existing file references with wrong paths
ui_tests_group.files.each do |file|
  file.remove_from_project
end

# Clear the source build phase
ui_test_target.source_build_phase.clear

# Set the group path correctly
ui_tests_group.set_source_tree('SOURCE_ROOT')
ui_tests_group.set_path('PromptUITests')

# Add source files with correct paths
['ScreenshotTests.swift', 'SnapshotHelper.swift'].each do |filename|
  file_ref = ui_tests_group.new_file(filename)
  file_ref.set_source_tree('SOURCE_ROOT')
  file_ref.set_path("PromptUITests/#{filename}")
  ui_test_target.source_build_phase.add_file_reference(file_ref)
end

# Add Info.plist reference (not in build phase)
info_plist_ref = ui_tests_group.new_file('Info.plist')
info_plist_ref.set_source_tree('SOURCE_ROOT')
info_plist_ref.set_path('PromptUITests/Info.plist')

# Save project
project.save

puts "Fixed PromptUITests file references!"
puts "Files now point to:"
puts "  - PromptUITests/ScreenshotTests.swift"
puts "  - PromptUITests/SnapshotHelper.swift"
puts "  - PromptUITests/Info.plist"
