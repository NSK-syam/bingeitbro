#!/usr/bin/env ruby
# frozen_string_literal: true

# Adds the BibWidget WidgetKit extension target to ios/App/App.xcodeproj, embeds it
# in the App target, and adds the local Capacitor plugin sources to the App target.
# Idempotent: safe to re-run.
#
# The xcodeproj gem ships with CocoaPods. With Homebrew CocoaPods, run:
#   GEM_HOME="$(brew --prefix cocoapods)/libexec" ruby scripts/mobile/add-widget-target.rb
# or with a system/user gem install:
#   gem install xcodeproj && ruby scripts/mobile/add-widget-target.rb

require 'xcodeproj'

ROOT = File.expand_path('../..', __dir__)
PROJECT_PATH = File.join(ROOT, 'ios/App/App.xcodeproj')

TEAM_ID = 'M9XD55FYL5'
WIDGET_NAME = 'BibWidget'
WIDGET_BUNDLE_ID = 'com.bingeitbro.app.BibWidget'
WIDGET_DEPLOYMENT_TARGET = '17.0'
WIDGET_SOURCES = %w[BibWidget.swift BibWidgetBundle.swift].freeze
WIDGET_OTHER_FILES = %w[Info.plist BibWidget.entitlements].freeze
APP_LOCAL_SOURCES = %w[BibNativePlugin.swift MainViewController.swift WidgetOwnerGate.swift].freeze

project = Xcodeproj::Project.open(PROJECT_PATH)
app_target = project.targets.find { |t| t.name == 'App' } or abort('App target not found')

# --- App target: local plugin sources -------------------------------------------------
app_group = project.main_group.children.find { |g| g.respond_to?(:path) && g.path == 'App' } or abort('App group not found')
APP_LOCAL_SOURCES.each do |name|
  ref = app_group.files.find { |f| f.path == name } || app_group.new_reference(name)
  unless app_target.source_build_phase.files_references.include?(ref)
    app_target.source_build_phase.add_file_reference(ref, true)
  end
end

# --- Privacy manifests (App Store required-reason APIs) ---------------------------------
def add_resource(target, group, name)
  ref = group.files.find { |f| f.path == name } || group.new_reference(name)
  unless target.resources_build_phase.files_references.include?(ref)
    target.resources_build_phase.add_file_reference(ref, true)
  end
  ref
end

add_resource(app_target, app_group, 'PrivacyInfo.xcprivacy')

# --- Widget target -------------------------------------------------------------------
widget_target = project.targets.find { |t| t.name == WIDGET_NAME }
unless widget_target
  widget_target = project.new_target(:app_extension, WIDGET_NAME, :ios, WIDGET_DEPLOYMENT_TARGET, nil, :swift)
end

widget_group = project.main_group.children.find { |g| g.respond_to?(:path) && g.path == WIDGET_NAME } ||
               project.main_group.new_group(WIDGET_NAME, WIDGET_NAME)

WIDGET_SOURCES.each do |name|
  ref = widget_group.files.find { |f| f.path == name } || widget_group.new_reference(name)
  unless widget_target.source_build_phase.files_references.include?(ref)
    widget_target.source_build_phase.add_file_reference(ref, true)
  end
end
add_resource(widget_target, widget_group, 'PrivacyInfo.xcprivacy')
WIDGET_OTHER_FILES.each do |name|
  widget_group.files.find { |f| f.path == name } || widget_group.new_reference(name)
end

# WidgetKit/SwiftUI/Foundation are autolinked by Swift. Drop the SDK-version-specific
# framework references new_target adds so the project does not pin an SDK path.
widget_target.frameworks_build_phase.files.to_a.each do |build_file|
  ref = build_file.file_ref
  build_file.remove_from_project
  ref.remove_from_project if ref && %w[DEVELOPER_DIR SDKROOT].include?(ref.source_tree)
end
frameworks_group = project.main_group.children.find { |g| g.isa == 'PBXGroup' && g.display_name == 'Frameworks' }
if frameworks_group
  frameworks_group.children.to_a.each do |child|
    if child.isa == 'PBXGroup'
      child.children.to_a.each { |c| c.remove_from_project if c.isa == 'PBXFileReference' && %w[DEVELOPER_DIR SDKROOT].include?(c.source_tree) }
      child.remove_from_project if child.children.empty?
    elsif child.isa == 'PBXFileReference' && %w[DEVELOPER_DIR SDKROOT].include?(child.source_tree)
      child.remove_from_project
    end
  end
  frameworks_group.remove_from_project if frameworks_group.children.empty?
end

# Keep extension versions in sync with the app (App Store requires matching versions).
app_debug = app_target.build_configurations.find { |c| c.name == 'Debug' }
marketing_version = app_debug.build_settings['MARKETING_VERSION'] || '1.0'
build_version = app_debug.build_settings['CURRENT_PROJECT_VERSION'] || '1'

widget_target.build_configurations.each do |config|
  s = config.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER'] = WIDGET_BUNDLE_ID
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['INFOPLIST_FILE'] = "#{WIDGET_NAME}/Info.plist"
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['CODE_SIGN_ENTITLEMENTS'] = "#{WIDGET_NAME}/#{WIDGET_NAME}.entitlements"
  s['CODE_SIGN_STYLE'] = 'Automatic'
  s['DEVELOPMENT_TEAM'] = TEAM_ID
  s['IPHONEOS_DEPLOYMENT_TARGET'] = WIDGET_DEPLOYMENT_TARGET
  s['SWIFT_VERSION'] = '5.0'
  s['TARGETED_DEVICE_FAMILY'] = '1,2'
  s['MARKETING_VERSION'] = marketing_version
  s['CURRENT_PROJECT_VERSION'] = build_version
  s['SKIP_INSTALL'] = 'YES'
  s['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
  s['SWIFT_EMIT_LOC_STRINGS'] = 'YES'
  s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  s.delete('ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME')
  s.delete('ASSETCATALOG_COMPILER_WIDGET_BACKGROUND_COLOR_NAME')
end

# Target attributes (automatic signing, team).
attrs = project.root_object.attributes['TargetAttributes'] ||= {}
attrs[widget_target.uuid] ||= {}
attrs[widget_target.uuid]['CreatedOnToolsVersion'] ||= '16.0'
attrs[widget_target.uuid]['DevelopmentTeam'] = TEAM_ID
attrs[widget_target.uuid]['ProvisioningStyle'] = 'Automatic'

# --- Embed in App --------------------------------------------------------------------
app_target.add_dependency(widget_target) unless app_target.dependencies.any? { |d| d.target == widget_target }

embed_phase = app_target.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' }
unless embed_phase
  embed_phase = app_target.new_copy_files_build_phase('Embed Foundation Extensions')
  embed_phase.symbol_dst_subfolder_spec = :plug_ins
  embed_phase.dst_path = ''
end
product_ref = widget_target.product_reference
unless embed_phase.files_references.include?(product_ref)
  build_file = embed_phase.add_file_reference(product_ref, true)
  build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
end

project.save
puts "OK: #{WIDGET_NAME} target configured and embedded in App; local plugin sources added."
