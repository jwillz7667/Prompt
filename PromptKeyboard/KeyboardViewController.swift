//
//  KeyboardViewController.swift
//  PromptKeyboard
//
//  Custom keyboard extension for quick prompt enhancement
//

import UIKit

class KeyboardViewController: UIInputViewController {

    // MARK: - Properties

    private var keyboardView: UIView!
    private var inputTextView: UITextView!
    private var enhanceButton: UIButton!
    private var clearButton: UIButton!
    private var pasteButton: UIButton!
    private var insertButton: UIButton!
    private var nextKeyboardButton: UIButton!
    private var statusLabel: UILabel!
    private var activityIndicator: UIActivityIndicatorView!

    private var enhancedText: String = ""
    private var isEnhancing = false

    // App Group for shared preferences (non-sensitive data)
    private let appGroupId = "group.com.res.promptomizer"
    private var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    // Use shared keychain for auth tokens (sensitive data)

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        setupKeyboardView()
        setupConstraints()
        loadCachedToken()
    }

    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        nextKeyboardButton.isHidden = !needsInputModeSwitchKey
    }

    override func textWillChange(_ textInput: UITextInput?) {
        // Called when the text is about to change
    }

    override func textDidChange(_ textInput: UITextInput?) {
        // Called when the text has changed
        updateUI()
    }

    // MARK: - Setup

    private func setupKeyboardView() {
        // Main container
        keyboardView = UIView()
        keyboardView.backgroundColor = UIColor.systemBackground
        keyboardView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(keyboardView)

        // Input text view
        inputTextView = UITextView()
        inputTextView.font = UIFont.systemFont(ofSize: 16)
        inputTextView.backgroundColor = UIColor.secondarySystemBackground
        inputTextView.layer.cornerRadius = 10
        inputTextView.textContainerInset = UIEdgeInsets(top: 10, left: 10, bottom: 10, right: 10)
        inputTextView.placeholder = "Enter prompt to enhance..."
        inputTextView.translatesAutoresizingMaskIntoConstraints = false
        keyboardView.addSubview(inputTextView)

        // Status label
        statusLabel = UILabel()
        statusLabel.font = UIFont.systemFont(ofSize: 12)
        statusLabel.textColor = UIColor.secondaryLabel
        statusLabel.textAlignment = .center
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        keyboardView.addSubview(statusLabel)

        // Activity indicator
        activityIndicator = UIActivityIndicatorView(style: .medium)
        activityIndicator.hidesWhenStopped = true
        activityIndicator.translatesAutoresizingMaskIntoConstraints = false
        keyboardView.addSubview(activityIndicator)

        // Button stack
        let buttonStack = UIStackView()
        buttonStack.axis = .horizontal
        buttonStack.spacing = 8
        buttonStack.distribution = .fillEqually
        buttonStack.translatesAutoresizingMaskIntoConstraints = false
        keyboardView.addSubview(buttonStack)

        // Paste button
        pasteButton = createActionButton(title: "Paste", icon: "doc.on.clipboard", action: #selector(pasteFromClipboard))
        buttonStack.addArrangedSubview(pasteButton)

        // Clear button
        clearButton = createActionButton(title: "Clear", icon: "xmark.circle", action: #selector(clearInput))
        buttonStack.addArrangedSubview(clearButton)

        // Enhance button
        enhanceButton = createPrimaryButton(title: "Enhance", icon: "sparkles", action: #selector(enhancePrompt))
        buttonStack.addArrangedSubview(enhanceButton)

        // Insert button
        insertButton = createActionButton(title: "Insert", icon: "text.insert", action: #selector(insertEnhanced))
        insertButton.isEnabled = false
        buttonStack.addArrangedSubview(insertButton)

        // Bottom row with next keyboard button
        let bottomStack = UIStackView()
        bottomStack.axis = .horizontal
        bottomStack.spacing = 8
        bottomStack.translatesAutoresizingMaskIntoConstraints = false
        keyboardView.addSubview(bottomStack)

        // Next keyboard button
        nextKeyboardButton = UIButton(type: .system)
        nextKeyboardButton.setImage(UIImage(systemName: "globe"), for: .normal)
        nextKeyboardButton.tintColor = UIColor.label
        nextKeyboardButton.addTarget(self, action: #selector(handleInputModeList(from:with:)), for: .allTouchEvents)
        nextKeyboardButton.translatesAutoresizingMaskIntoConstraints = false
        bottomStack.addArrangedSubview(nextKeyboardButton)

        // Spacer
        let spacer = UIView()
        spacer.translatesAutoresizingMaskIntoConstraints = false
        bottomStack.addArrangedSubview(spacer)

        // Store references for constraints
        self.buttonStack = buttonStack
        self.bottomStack = bottomStack
    }

    private var buttonStack: UIStackView!
    private var bottomStack: UIStackView!

    private func setupConstraints() {
        NSLayoutConstraint.activate([
            // Keyboard view
            keyboardView.topAnchor.constraint(equalTo: view.topAnchor),
            keyboardView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            keyboardView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            keyboardView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            keyboardView.heightAnchor.constraint(equalToConstant: 260),

            // Input text view
            inputTextView.topAnchor.constraint(equalTo: keyboardView.topAnchor, constant: 8),
            inputTextView.leadingAnchor.constraint(equalTo: keyboardView.leadingAnchor, constant: 8),
            inputTextView.trailingAnchor.constraint(equalTo: keyboardView.trailingAnchor, constant: -8),
            inputTextView.heightAnchor.constraint(equalToConstant: 100),

            // Status label
            statusLabel.topAnchor.constraint(equalTo: inputTextView.bottomAnchor, constant: 4),
            statusLabel.leadingAnchor.constraint(equalTo: keyboardView.leadingAnchor, constant: 8),
            statusLabel.trailingAnchor.constraint(equalTo: keyboardView.trailingAnchor, constant: -8),

            // Activity indicator
            activityIndicator.centerYAnchor.constraint(equalTo: statusLabel.centerYAnchor),
            activityIndicator.trailingAnchor.constraint(equalTo: statusLabel.leadingAnchor, constant: -4),

            // Button stack
            buttonStack.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 8),
            buttonStack.leadingAnchor.constraint(equalTo: keyboardView.leadingAnchor, constant: 8),
            buttonStack.trailingAnchor.constraint(equalTo: keyboardView.trailingAnchor, constant: -8),
            buttonStack.heightAnchor.constraint(equalToConstant: 44),

            // Bottom stack
            bottomStack.topAnchor.constraint(equalTo: buttonStack.bottomAnchor, constant: 8),
            bottomStack.leadingAnchor.constraint(equalTo: keyboardView.leadingAnchor, constant: 8),
            bottomStack.trailingAnchor.constraint(equalTo: keyboardView.trailingAnchor, constant: -8),
            bottomStack.heightAnchor.constraint(equalToConstant: 44),

            // Next keyboard button
            nextKeyboardButton.widthAnchor.constraint(equalToConstant: 44),
        ])
    }

    // MARK: - Button Creation

    private func createActionButton(title: String, icon: String, action: Selector) -> UIButton {
        var config = UIButton.Configuration.bordered()
        config.title = title
        config.image = UIImage(systemName: icon)
        config.imagePadding = 4
        config.cornerStyle = .medium
        config.baseForegroundColor = UIColor.label

        let button = UIButton(configuration: config)
        button.addTarget(self, action: action, for: .touchUpInside)
        return button
    }

    private func createPrimaryButton(title: String, icon: String, action: Selector) -> UIButton {
        var config = UIButton.Configuration.filled()
        config.title = title
        config.image = UIImage(systemName: icon)
        config.imagePadding = 4
        config.cornerStyle = .medium
        config.baseBackgroundColor = UIColor.systemBlue
        config.baseForegroundColor = UIColor.white

        let button = UIButton(configuration: config)
        button.addTarget(self, action: action, for: .touchUpInside)
        return button
    }

    // MARK: - Actions

    @objc private func pasteFromClipboard() {
        if let text = UIPasteboard.general.string {
            inputTextView.text = text
            updateUI()
        }
    }

    @objc private func clearInput() {
        inputTextView.text = ""
        enhancedText = ""
        insertButton.isEnabled = false
        statusLabel.text = ""
        updateUI()
    }

    @objc private func enhancePrompt() {
        guard let text = inputTextView.text, !text.isEmpty else {
            statusLabel.text = "Enter a prompt first"
            return
        }

        guard let token = getAuthToken() else {
            statusLabel.text = "Please sign in via the main app"
            return
        }

        isEnhancing = true
        updateUI()
        activityIndicator.startAnimating()
        statusLabel.text = "Enhancing..."

        Task {
            await performEnhancement(prompt: text, token: token)
        }
    }

    @objc private func insertEnhanced() {
        guard !enhancedText.isEmpty else { return }
        textDocumentProxy.insertText(enhancedText)

        // Clear after inserting
        clearInput()
        statusLabel.text = "Inserted!"

        // Reset status after delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.statusLabel.text = ""
        }
    }

    // MARK: - Enhancement API

    private func performEnhancement(prompt: String, token: String) async {
        // Use stored base URL or default to production
        let baseURL = sharedDefaults?.string(forKey: "apiBaseURL") ?? "https://api.promptomize.app"

        guard let url = URL(string: "\(baseURL)/api/v1/prompts/enhance") else {
            await MainActor.run {
                self.statusLabel.text = "Invalid API URL"
                self.isEnhancing = false
                self.activityIndicator.stopAnimating()
            }
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        // Include user preferences from shared defaults
        let tone = sharedDefaults?.string(forKey: "selectedTone") ?? "professional"
        let length = sharedDefaults?.string(forKey: "outputLength") ?? "standard"

        var body: [String: Any] = [
            "prompt": prompt,
            "stream": false,
            "tone": tone,
            "length": length
        ]

        // Add custom instructions if available
        if let customInstructions = sharedDefaults?.string(forKey: "customInstructions"),
           !customInstructions.isEmpty {
            body["customInstructions"] = customInstructions
        }

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw KeyboardError.invalidResponse
            }

            if httpResponse.statusCode == 401 {
                await MainActor.run {
                    self.statusLabel.text = "Session expired. Please sign in again."
                    self.isEnhancing = false
                    self.activityIndicator.stopAnimating()
                }
                return
            }

            guard httpResponse.statusCode == 200 else {
                throw KeyboardError.serverError(httpResponse.statusCode)
            }

            let result = try JSONDecoder().decode(EnhanceResponse.self, from: data)

            await MainActor.run {
                self.enhancedText = result.enhancedPrompt
                self.inputTextView.text = result.enhancedPrompt
                self.insertButton.isEnabled = true
                self.statusLabel.text = "Enhanced! Tap Insert to add."
                self.isEnhancing = false
                self.activityIndicator.stopAnimating()
            }

        } catch {
            await MainActor.run {
                self.statusLabel.text = "Enhancement failed"
                self.isEnhancing = false
                self.activityIndicator.stopAnimating()
            }
        }
    }

    // MARK: - Auth Token

    private func loadCachedToken() {
        // Token is stored via shared keychain from main app
    }

    private func getAuthToken() -> String? {
        // Get token from shared keychain (secure storage)
        return KeychainHelper.accessToken
    }

    // MARK: - UI Updates

    private func updateUI() {
        let hasInput = !(inputTextView.text?.isEmpty ?? true)
        clearButton.isEnabled = hasInput
        enhanceButton.isEnabled = hasInput && !isEnhancing

        if isEnhancing {
            enhanceButton.configuration?.title = "..."
        } else {
            enhanceButton.configuration?.title = "Enhance"
        }
    }
}

// MARK: - UITextView Placeholder Extension

extension UITextView {
    private struct AssociatedKeys {
        static var placeholder = "placeholder"
        static var placeholderLabel = "placeholderLabel"
    }

    var placeholder: String? {
        get {
            return objc_getAssociatedObject(self, &AssociatedKeys.placeholder) as? String
        }
        set {
            objc_setAssociatedObject(self, &AssociatedKeys.placeholder, newValue, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
            updatePlaceholder()
        }
    }

    private var placeholderLabel: UILabel? {
        get {
            return objc_getAssociatedObject(self, &AssociatedKeys.placeholderLabel) as? UILabel
        }
        set {
            objc_setAssociatedObject(self, &AssociatedKeys.placeholderLabel, newValue, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        }
    }

    private func updatePlaceholder() {
        if placeholderLabel == nil {
            let label = UILabel()
            label.font = font
            label.textColor = UIColor.placeholderText
            label.translatesAutoresizingMaskIntoConstraints = false
            addSubview(label)

            NSLayoutConstraint.activate([
                label.topAnchor.constraint(equalTo: topAnchor, constant: textContainerInset.top),
                label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: textContainerInset.left + 5),
                label.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -textContainerInset.right)
            ])

            placeholderLabel = label
        }

        placeholderLabel?.text = placeholder
        placeholderLabel?.isHidden = !text.isEmpty
    }
}

// MARK: - Response Models

struct EnhanceResponse: Decodable {
    let enhancedPrompt: String
    let tokensUsed: Int?
    let model: String?
}

// MARK: - Errors

enum KeyboardError: Error {
    case invalidResponse
    case serverError(Int)
    case noToken
}
