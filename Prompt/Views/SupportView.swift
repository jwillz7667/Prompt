//
//  SupportView.swift
//  Prompt
//
//  In-app support chat with AI agent and ticket management
//  AAA WCAG Compliant Colors
//

import SwiftUI

struct SupportView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthManager.self) private var authManager
    @StateObject private var supportService = SupportService.shared
    @StateObject private var socketManager = SupportSocketManager.shared

    @State private var messageText = ""
    @State private var messages: [SupportMessage] = []
    @State private var isTyping = false
    @State private var agentIsTyping = false
    @State private var ticketCreated = false
    @State private var currentTicketId: String?
    @State private var showTicketsList = false

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    private var userEmail: String {
        authManager.currentUser?.email ?? "You"
    }

    private var welcomeMessage: SupportMessage {
        SupportMessage(
            role: "assistant",
            content: "Hi! I'm your support assistant. I can help with general questions about Promptomize, explain features, troubleshoot common issues, or create a support ticket if you need help from our team.\n\nHow can I help you today?"
        )
    }

    var body: some View {
        NavigationStack {
            ZStack {
                // Consistent liquid glass background
                LiquidGlassBackground()

                VStack(spacing: 0) {
                // Chat messages
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(messages) { message in
                                MessageBubble(
                                    message: message,
                                    textPrimary: textPrimary,
                                    textSecondary: textSecondary,
                                    userEmail: userEmail
                                )
                                .id(message.id)
                            }

                            if isTyping {
                                TypingIndicator()
                                    .id("typing")
                            }

                            // Agent typing indicator
                            if agentIsTyping {
                                AgentTypingIndicator()
                                    .id("agent-typing")
                            }
                        }
                        .padding()
                    }
                    .onChange(of: messages.count) { _, _ in
                        withAnimation {
                            proxy.scrollTo(messages.last?.id, anchor: .bottom)
                        }
                    }
                    .onChange(of: isTyping) { _, newValue in
                        if newValue {
                            withAnimation {
                                proxy.scrollTo("typing", anchor: .bottom)
                            }
                        }
                    }
                    .onChange(of: agentIsTyping) { _, newValue in
                        if newValue {
                            withAnimation {
                                proxy.scrollTo("agent-typing", anchor: .bottom)
                            }
                        }
                    }
                }

                // Ticket created banner
                if ticketCreated, let ticketId = currentTicketId {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(colorScheme == .dark ? Color(red: 48/255, green: 209/255, blue: 88/255) : Color(red: 0.1, green: 0.7, blue: 0.4))
                        Text("Support ticket created")
                            .font(.subheadline)
                            .foregroundStyle(textPrimary)
                        Spacer()
                        Text("#\(ticketId.prefix(8))")
                            .font(.caption)
                            .foregroundStyle(textSecondary)
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                    .background((colorScheme == .dark ? Color(red: 48/255, green: 209/255, blue: 88/255) : Color(red: 0.1, green: 0.7, blue: 0.4)).opacity(0.1))
                }

                // Input area
                HStack(spacing: 12) {
                    TextField("Type your message...", text: $messageText, axis: .vertical)
                        .textFieldStyle(.plain)
                        .padding(12)
                        .background(bgSecondary)
                        .clipShape(RoundedRectangle(cornerRadius: 20))
                        .lineLimit(1...5)
                        .foregroundStyle(textPrimary)
                        .disabled(supportService.isLoading)
                        .onChange(of: messageText) { _, newValue in
                            // Send typing indicator when connected to socket
                            if currentTicketId != nil && !newValue.isEmpty {
                                socketManager.startTyping()
                            }
                        }

                    Button {
                        Task {
                            await sendMessage()
                        }
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 32))
                            .foregroundStyle(messageText.isEmpty || supportService.isLoading ? textSecondary : accentColor)
                    }
                    .disabled(messageText.isEmpty || supportService.isLoading)
                }
                .padding()
                .background(.ultraThinMaterial)
            }
            }
            .navigationTitle("Support")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") {
                        dismiss()
                    }
                    .foregroundStyle(textPrimary)
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showTicketsList = true
                    } label: {
                        Image(systemName: "ticket")
                            .foregroundStyle(textPrimary)
                    }
                }
            }
            .sheet(isPresented: $showTicketsList) {
                TicketsListView()
            }
            .onAppear {
                if messages.isEmpty {
                    messages.append(welcomeMessage)
                }
                setupSocketCallbacks()
                // Mark all support messages as read when view opens
                UnreadMessageManager.shared.markAllAsRead()
            }
            .onDisappear {
                socketManager.disconnect()
            }
            .onChange(of: socketManager.agentIsTyping) { _, newValue in
                agentIsTyping = newValue
            }
        }
    }

    private func setupSocketCallbacks() {
        // Handle incoming messages from socket
        socketManager.onMessageReceived = { [self] message in
            // Check if message already exists to avoid duplicates
            if !messages.contains(where: { $0.id == message.id }) {
                messages.append(message)
            }
        }

        // Handle typing updates
        socketManager.onTypingUpdate = { [self] isTyping in
            agentIsTyping = isTyping
        }
    }

    private func sendMessage() async {
        let trimmedMessage = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedMessage.isEmpty else { return }

        // Stop typing indicator
        socketManager.stopTyping()

        // Add user message
        let userMessage = SupportMessage(role: "user", content: trimmedMessage)
        messages.append(userMessage)
        messageText = ""

        isTyping = true

        do {
            let response: ChatResponse
            if let ticketId = currentTicketId {
                // Continue conversation on existing ticket
                response = try await supportService.sendMessageToTicket(
                    ticketId: ticketId,
                    message: trimmedMessage
                )
            } else {
                // New conversation
                let history = messages.dropLast() // Exclude the message we just added
                response = try await supportService.sendMessage(
                    trimmedMessage,
                    conversationHistory: Array(history)
                )
            }

            isTyping = false

            // Add assistant response (only if AI responded, not when agent is handling)
            if !response.reply.isEmpty {
                let assistantMessage = SupportMessage(role: "assistant", content: response.reply)
                messages.append(assistantMessage)
            }

            // Handle ticket creation - connect to socket for real-time updates
            if response.ticketCreated, let ticketId = response.ticketId {
                ticketCreated = true
                currentTicketId = ticketId
                // Connect to socket for real-time updates
                socketManager.connect(ticketId: ticketId)
            }
        } catch {
            isTyping = false
            let errorMessage = SupportMessage(
                role: "assistant",
                content: "I'm having trouble connecting right now. Please try again in a moment, or email us at support@promptomize.app if the issue persists."
            )
            messages.append(errorMessage)
        }
    }
}

// MARK: - Message Bubble

struct MessageBubble: View {
    @Environment(\.colorScheme) private var colorScheme
    let message: SupportMessage
    let textPrimary: Color
    let textSecondary: Color
    var userEmail: String? = nil
    var assignedAgentName: String? = nil

    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    private var senderName: String {
        if message.isUser {
            return userEmail ?? "You"
        } else if message.role == "agent" {
            return assignedAgentName ?? "Support Agent"
        } else {
            return "Prompt Bot"
        }
    }

    private var senderIcon: String {
        if message.isUser {
            return "person.circle.fill"
        } else if message.role == "agent" {
            return "headphones.circle.fill"
        } else {
            return "cpu.fill"
        }
    }

    private var isAgent: Bool {
        message.role == "agent"
    }

    private var agentColor: Color {
        colorScheme == .dark ? Color(red: 48/255, green: 209/255, blue: 88/255) : Color(red: 0.1, green: 0.7, blue: 0.4)
    }

    private var bubbleColor: Color {
        if message.isUser {
            return accentColor
        } else if isAgent {
            return agentColor.opacity(colorScheme == .dark ? 0.3 : 0.15)
        } else {
            return Color.adaptiveBackgroundSecondary
        }
    }

    var body: some View {
        HStack {
            if message.isUser {
                Spacer(minLength: 60)
            }

            VStack(alignment: message.isUser ? .trailing : .leading, spacing: 6) {
                // Sender info
                HStack(spacing: 4) {
                    if !message.isUser {
                        Image(systemName: senderIcon)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(isAgent ? agentColor : accentColor)
                    }

                    Text(senderName)
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                        .foregroundStyle(message.isUser ? textSecondary : (isAgent ? agentColor : accentColor))

                    if message.isUser {
                        Image(systemName: senderIcon)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(textSecondary)
                    }
                }

                // Message content
                Text(message.content)
                    .foregroundStyle(message.isUser ? Color.adaptiveTextOnAccent : textPrimary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(bubbleColor)
                    .clipShape(RoundedRectangle(cornerRadius: 18))

                // Timestamp
                if let createdAt = message.createdAt {
                    Text(createdAt, style: .time)
                        .font(.caption2)
                        .foregroundStyle(textSecondary)
                }
            }

            if !message.isUser {
                Spacer(minLength: 60)
            }
        }
    }
}

// MARK: - Typing Indicator

struct TypingIndicator: View {
    @State private var dotCount = 0

    var body: some View {
        HStack {
            HStack(spacing: 4) {
                ForEach(0..<3) { index in
                    Circle()
                        .fill(Color.adaptiveTextTertiary)
                        .frame(width: 8, height: 8)
                        .opacity(dotCount == index ? 1 : 0.4)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Color.adaptiveBackgroundSecondary)
            .clipShape(RoundedRectangle(cornerRadius: 18))

            Spacer()
        }
        .onAppear {
            Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { _ in
                withAnimation {
                    dotCount = (dotCount + 1) % 3
                }
            }
        }
    }
}

// MARK: - Agent Typing Indicator

struct AgentTypingIndicator: View {
    @Environment(\.colorScheme) private var colorScheme
    @State private var dotCount = 0

    private var agentColor: Color {
        colorScheme == .dark ? Color(red: 48/255, green: 209/255, blue: 88/255) : Color(red: 0.1, green: 0.7, blue: 0.4)
    }

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 4) {
                    Image(systemName: "headphones.circle.fill")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(agentColor)
                    Text("Support Agent")
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                        .foregroundStyle(agentColor)
                    Text("is typing")
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(Color.adaptiveTextSecondary)
                }

                HStack(spacing: 4) {
                    ForEach(0..<3) { index in
                        Circle()
                            .fill(agentColor)
                            .frame(width: 8, height: 8)
                            .opacity(dotCount == index ? 1 : 0.4)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(agentColor.opacity(colorScheme == .dark ? 0.2 : 0.1))
                .clipShape(RoundedRectangle(cornerRadius: 18))
            }

            Spacer()
        }
        .onAppear {
            Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { _ in
                withAnimation {
                    dotCount = (dotCount + 1) % 3
                }
            }
        }
    }
}

// MARK: - Tickets List View

struct TicketsListView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @StateObject private var supportService = SupportService.shared

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }

    var body: some View {
        NavigationStack {
            Group {
                if supportService.isLoading && supportService.tickets.isEmpty {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if supportService.tickets.isEmpty {
                    ContentUnavailableView(
                        "No Support Tickets",
                        systemImage: "ticket",
                        description: Text("When you need help from our team, a ticket will be created automatically.")
                    )
                } else {
                    List(supportService.tickets) { ticket in
                        NavigationLink {
                            TicketDetailView(ticketId: ticket.id)
                        } label: {
                            TicketRow(ticket: ticket)
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .background(bgPrimary)
            .navigationTitle("My Tickets")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundStyle(textPrimary)
                }
            }
            .task {
                try? await supportService.fetchTickets()
            }
        }
    }
}

// MARK: - Ticket Row

struct TicketRow: View {
    let ticket: SupportTicket

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: ticket.category.icon)
                    .foregroundStyle(textSecondary)
                    .frame(width: 20)

                Text(ticket.subject)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundStyle(textPrimary)
                    .lineLimit(1)
            }

            HStack {
                Label(ticket.status.displayName, systemImage: ticket.status.icon)
                    .font(.caption)
                    .foregroundStyle(statusColor)

                Spacer()

                Text(ticket.createdAt, format: .dateTime.month(.abbreviated).day().hour().minute())
                    .font(.caption)
                    .foregroundStyle(textSecondary)
            }
        }
        .padding(.vertical, 4)
    }

    @Environment(\.colorScheme) private var colorScheme

    private var statusColor: Color {
        switch ticket.status {
        case .open: return colorScheme == .dark ? Color(red: 255/255, green: 159/255, blue: 10/255) : Color(red: 0.9, green: 0.6, blue: 0.1)
        case .inProgress: return colorScheme == .dark ? Color.brandCyan : Color.brandPurple
        case .waitingOnUser: return colorScheme == .dark ? Color(red: 255/255, green: 214/255, blue: 10/255) : Color(red: 0.8, green: 0.65, blue: 0.1)
        case .resolved: return colorScheme == .dark ? Color(red: 48/255, green: 209/255, blue: 88/255) : Color(red: 0.1, green: 0.7, blue: 0.4)
        case .closed: return Color.adaptiveTextTertiary
        }
    }
}

// MARK: - Ticket Detail View

struct TicketDetailView: View {
    let ticketId: String

    @Environment(\.colorScheme) private var colorScheme
    @Environment(AuthManager.self) private var authManager
    @StateObject private var supportService = SupportService.shared
    @StateObject private var socketManager = SupportSocketManager.shared
    @State private var messageText = ""
    @State private var isTyping = false
    @State private var agentIsTyping = false
    @State private var localMessages: [SupportMessage] = []

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    private var userEmail: String {
        authManager.currentUser?.email ?? "You"
    }

    private var displayMessages: [SupportMessage] {
        // Combine ticket messages with any locally received socket messages
        let ticketMessages = supportService.currentTicket?.messages ?? []
        var combined = ticketMessages

        // Add any socket messages that aren't already in the ticket
        for msg in localMessages {
            if !combined.contains(where: { $0.id == msg.id }) {
                combined.append(msg)
            }
        }

        return combined.sorted { ($0.createdAt ?? Date.distantPast) < ($1.createdAt ?? Date.distantPast) }
    }

    var body: some View {
        VStack(spacing: 0) {
            if supportService.isLoading && supportService.currentTicket == nil {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let ticket = supportService.currentTicket {
                // Messages
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            // Ticket info header
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Label(ticket.category.displayName, systemImage: ticket.category.icon)
                                    Spacer()
                                    Label(ticket.status.displayName, systemImage: ticket.status.icon)
                                }
                                .font(.caption)
                                .foregroundStyle(textSecondary)

                                Text(ticket.subject)
                                    .font(.headline)
                                    .foregroundStyle(textPrimary)

                                Text("Created \(ticket.createdAt, format: .dateTime.month(.abbreviated).day().year().hour().minute())")
                                    .font(.caption)
                                    .foregroundStyle(textSecondary)
                            }
                            .padding()
                            .background(bgSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .padding(.horizontal)

                            // Messages
                            ForEach(displayMessages) { message in
                                MessageBubble(
                                    message: message,
                                    textPrimary: textPrimary,
                                    textSecondary: textSecondary,
                                    userEmail: userEmail,
                                    assignedAgentName: ticket.assignedAgentName
                                )
                                .id(message.id)
                            }

                            if isTyping {
                                TypingIndicator()
                                    .id("typing")
                            }

                            // Agent typing indicator
                            if agentIsTyping {
                                AgentTypingIndicator()
                                    .id("agent-typing")
                            }
                        }
                        .padding()
                    }
                }

                // Input area (if ticket is still open)
                if ticket.status != .closed && ticket.status != .resolved {
                    HStack(spacing: 12) {
                        TextField("Type your message...", text: $messageText, axis: .vertical)
                            .textFieldStyle(.plain)
                            .padding(12)
                            .background(bgSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: 20))
                            .lineLimit(1...5)
                            .foregroundStyle(textPrimary)
                            .disabled(supportService.isLoading)
                            .onChange(of: messageText) { _, newValue in
                                // Send typing indicator
                                if !newValue.isEmpty {
                                    socketManager.startTyping()
                                }
                            }

                        Button {
                            Task {
                                await sendMessage()
                            }
                        } label: {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.system(size: 32))
                                .foregroundStyle(messageText.isEmpty || supportService.isLoading ? textSecondary : accentColor)
                        }
                        .disabled(messageText.isEmpty || supportService.isLoading)
                    }
                    .padding()
                    .background(bgPrimary)
                } else {
                    // Closed ticket banner
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(colorScheme == .dark ? Color(red: 48/255, green: 209/255, blue: 88/255) : Color(red: 0.1, green: 0.7, blue: 0.4))
                        Text("This ticket has been \(ticket.status == .resolved ? "resolved" : "closed")")
                            .font(.subheadline)
                            .foregroundStyle(textPrimary)
                        Spacer()
                    }
                    .padding()
                    .background((colorScheme == .dark ? Color(red: 48/255, green: 209/255, blue: 88/255) : Color(red: 0.1, green: 0.7, blue: 0.4)).opacity(0.1))
                }
            }
        }
        .background(bgPrimary)
        .navigationTitle("Ticket")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            _ = try? await supportService.fetchTicket(id: ticketId)
            // Connect to socket for real-time updates
            setupSocketConnection()
        }
        .onDisappear {
            socketManager.disconnect()
        }
        .onChange(of: socketManager.agentIsTyping) { _, newValue in
            agentIsTyping = newValue
        }
    }

    private func setupSocketConnection() {
        // Connect to socket
        socketManager.connect(ticketId: ticketId)

        // Handle incoming messages
        socketManager.onMessageReceived = { message in
            // Add to local messages if not already present
            if !localMessages.contains(where: { $0.id == message.id }) {
                localMessages.append(message)
            }
        }

        // Handle typing updates
        socketManager.onTypingUpdate = { isTyping in
            agentIsTyping = isTyping
        }
    }

    private func sendMessage() async {
        let trimmedMessage = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedMessage.isEmpty else { return }

        // Stop typing indicator
        socketManager.stopTyping()

        messageText = ""
        isTyping = true

        do {
            _ = try await supportService.sendMessageToTicket(
                ticketId: ticketId,
                message: trimmedMessage
            )
            // Don't need to fetch - socket will update with new messages
        } catch {
            #if DEBUG
            print("[Support] Error sending message: \(error)")
            #endif
            // On error, refresh to ensure consistency
            _ = try? await supportService.fetchTicket(id: ticketId)
        }

        isTyping = false
    }
}

#Preview {
    SupportView()
}
