//
//  PromptWidgetExtensionBundle.swift
//  PromptWidgetExtension
//
//  Widget bundle entry point for Promptomize widgets
//

import WidgetKit
import SwiftUI

@main
struct PromptWidgetExtensionBundle: WidgetBundle {
    var body: some Widget {
        QuotaWidget()
        QuickEnhanceWidget()
        EnhancementLiveActivity()
    }
}
