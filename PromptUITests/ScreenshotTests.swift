//
//  ScreenshotTests.swift
//  PromptUITests
//
//  App Store screenshot capture tests
//

import XCTest

@MainActor
final class ScreenshotTests: XCTestCase {

    var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()

        // Setup snapshot helper
        setupSnapshot(app)

        // Launch app
        app.launch()
    }

    override func tearDownWithError() throws {
        app = nil
    }

    // MARK: - Screenshot Tests

    func testCaptureAllScreenshots() throws {
        // Wait for app to fully load
        sleep(2)

        // 1. Main enhance screen (empty state)
        snapshot("01_EnhanceScreen_Empty")

        // 2. Type a sample prompt
        let textEditor = app.textViews.firstMatch
        if textEditor.waitForExistence(timeout: 5) {
            textEditor.tap()
            textEditor.typeText("Write a compelling product description for a new smart home device that combines a speaker, light, and air purifier")
            snapshot("02_EnhanceScreen_WithPrompt")
        }

        // 3. Tap enhance button and wait for result
        let enhanceButton = app.buttons["Enhance Prompt"]
        if enhanceButton.waitForExistence(timeout: 3) {
            enhanceButton.tap()

            // Wait for enhancement to complete (loading animation)
            sleep(8)

            // 4. Enhanced result screen
            snapshot("03_EnhancedResult")

            // 5. Copy and action buttons visible
            let copyButton = app.buttons["Copy Prompt"]
            if copyButton.waitForExistence(timeout: 3) {
                snapshot("04_ResultActions")
            }
        }

        // 6. Open history
        let historyButton = app.buttons["clock.arrow.circlepath"]
        if historyButton.waitForExistence(timeout: 3) {
            historyButton.tap()
            sleep(1)
            snapshot("05_History")

            // Close history
            let doneButton = app.buttons["Done"]
            if doneButton.waitForExistence(timeout: 2) {
                doneButton.tap()
            }
        }

        // 7. Open settings
        let settingsButton = app.buttons["gearshape.fill"]
        if settingsButton.waitForExistence(timeout: 3) {
            settingsButton.tap()
            sleep(1)
            snapshot("06_Settings")

            // Close settings
            let closeButton = app.buttons["xmark"]
            if closeButton.waitForExistence(timeout: 2) {
                closeButton.tap()
            } else {
                // Swipe down to dismiss
                app.swipeDown()
            }
        }

        // 8. Open templates
        let templatesButton = app.buttons["doc.on.doc"]
        if templatesButton.waitForExistence(timeout: 3) {
            templatesButton.tap()
            sleep(1)
            snapshot("07_Templates")

            // Close templates
            app.swipeDown()
        }

        // 9. Paywall (tap usage indicator if visible)
        let usageIndicator = app.buttons.matching(identifier: "UsageIndicator").firstMatch
        if usageIndicator.waitForExistence(timeout: 2) {
            usageIndicator.tap()
            sleep(1)
            snapshot("08_Paywall")

            // Close paywall
            let closePaywall = app.buttons["Close"]
            if closePaywall.waitForExistence(timeout: 2) {
                closePaywall.tap()
            }
        }
    }

    // MARK: - Individual Screenshot Tests (for debugging)

    func testMainScreen() throws {
        sleep(2)
        snapshot("MainScreen")
    }

    func testEnhancedPrompt() throws {
        sleep(2)

        let textEditor = app.textViews.firstMatch
        if textEditor.waitForExistence(timeout: 5) {
            textEditor.tap()
            textEditor.typeText("Explain quantum computing to a 10 year old")

            let enhanceButton = app.buttons["Enhance Prompt"]
            if enhanceButton.waitForExistence(timeout: 3) {
                enhanceButton.tap()
                sleep(10)
                snapshot("EnhancedPrompt")
            }
        }
    }

    func testPaywall() throws {
        sleep(2)

        // Navigate to paywall - try usage indicator first
        let usageIndicator = app.buttons.matching(NSPredicate(format: "label CONTAINS 'prompts'")).firstMatch
        if usageIndicator.waitForExistence(timeout: 3) {
            usageIndicator.tap()
        } else {
            // Try deep think toggle (locked for free users)
            let deepThinkButton = app.buttons.matching(NSPredicate(format: "label CONTAINS 'brain'")).firstMatch
            if deepThinkButton.waitForExistence(timeout: 3) {
                deepThinkButton.tap()
            }
        }

        sleep(1)
        snapshot("Paywall")
    }
}
