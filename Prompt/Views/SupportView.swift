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
    @StateObject private var supportService = SupportService.shared

    @State private var messageText = ""
    @State private var messages: [SupportMessage] = []
    @State private var isTyping = false
    @State private var ticketCreated = false
    @State private var currentTicketId: String?
    @State private var showTicketsList = false

    // AAA Compliant Colors
    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }

    private var welcomeMessage: SupportMessage {
        SupportMessage(
            role: "assistant",
            content: "Hi! I'm your support assistant. I can help with general questions about Promptomize, explain features, troubleshoot common issues, or create a support ticket if you need help from our team.\n\nHow can I help you today?"
        )
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Chat messages
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(messages) { message in
                                MessageBubble(
                                    message: message,
                                    textPrimary: textPrimary,
                                    textSecondary: textSecondary
                                )
                                .id(message.id)
                            }

                            if isTyping {
                                TypingIndicator()
                                    .id("typing")
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
                }

                // Ticket created banner
                if ticketCreated, let ticketId = currentTicketId {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
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
                    .background(Color.green.opacity(0.1))
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

                    Button {
                        Task {
                            await sendMessage()
                        }
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 32))
                            .foregroundStyle(messageText.isEmpty || supportService.isLoading ? textSecondary : .blue)
                    }
                    .disabled(messageText.isEmpty || supportService.isLoading)
                }
                .padding()
                .background(bgPrimary)
            }
            .background(bgPrimary)
            .navigationTitle("Support")
            .navigationBarTitleDisplayMode(.inline)
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
            }
        }
    }

    private func sendMessage() async {
        let trimmedMessage = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedMessage.isEmpty else { return }

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

            // Add assistant response
            let assistantMessage = SupportMessage(role: "assistant", content: response.reply)
            messages.append(assistantMessage)

            // Handle ticket creation
            if response.ticketCreated, let ticketId = response.ticketId {
                ticketCreated = true
                currentTicketId = ticketId
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
    let message: SupportMessage
    let textPrimary: Color
    let textSecondary: Color

    var body: some View {
        HStack {
            if message.isUser {
                Spacer(minLength: 60)
            }

            VStack(alignment: message.isUser ? .trailing : .leading, spacing: 4) {
                Text(message.content)
                    .foregroundStyle(message.isUser ? .white : textPrimary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(message.isUser ? Color.blue : Color.adaptiveBackgroundSecondary)
                    .clipShape(RoundedRectangle(cornerRadius: 18))

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
                        .fill(Color.gray)
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

                Text(ticket.createdAt, style: .relative)
                    .font(.caption)
                    .foregroundStyle(textSecondary)
            }
        }
        .padding(.vertical, 4)
    }

    private var statusColor: Color {
        switch ticket.status {
        case .open: return .orange
        case .inProgress: return .blue
        case .waitingOnUser: return .yellow
        case .resolved: return .green
        case .closed: return .gray
        }
    }
}

// MARK: - Ticket Detail View

struct TicketDetailView: View {
    let ticketId: String

    @Environment(\.colorScheme) private var colorScheme
    @StateObject private var supportService = SupportService.shared
    @State private var messageText = ""
    @State private var isTyping = false

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var bgPrimary: Color { Color.adaptiveBackgroundPrimary }
    private var bgSecondary: Color { Color.adaptiveBackgroundSecondary }

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

                                Text("Created \(ticket.createdAt, style: .relative)")
                                    .font(.caption)
                                    .foregroundStyle(textSecondary)
                            }
                            .padding()
                            .background(bgSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .padding(.horizontal)

                            // Messages
                            if let messages = ticket.messages {
                                ForEach(messages) { message in
                                    MessageBubble(
                                        message: message,
                                        textPrimary: textPrimary,
                                        textSecondary: textSecondary
                                    )
                                    .id(message.id)
                                }
                            }

                            if isTyping {
                                TypingIndicator()
                                    .id("typing")
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

                        Button {
                            Task {
                                await sendMessage()
                            }
                        } label: {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.system(size: 32))
                                .foregroundStyle(messageText.isEmpty || supportService.isLoading ? textSecondary : .blue)
                        }
                        .disabled(messageText.isEmpty || supportService.isLoading)
                    }
                    .padding()
                    .background(bgPrimary)
                } else {
                    // Closed ticket banner
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Text("This ticket has been \(ticket.status == .resolved ? "resolved" : "closed")")
                            .font(.subheadline)
                            .foregroundStyle(textPrimary)
                        Spacer()
                    }
                    .padding()
                    .background(Color.green.opacity(0.1))
                }
            }
        }
        .background(bgPrimary)
        .navigationTitle("Ticket")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            _ = try? await supportService.fetchTicket(id: ticketId)
        }
    }

    private func sendMessage() async {
        let trimmedMessage = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedMessage.isEmpty else { return }

        messageText = ""
        isTyping = true

        do {
            _ = try await supportService.sendMessageToTicket(
                ticketId: ticketId,
                message: trimmedMessage
            )
            // Refresh ticket to get updated messages
            _ = try await supportService.fetchTicket(id: ticketId)
        } catch {
            #if DEBUG
            print("[Support] Error sending message: \(error)")
            #endif
        }

        isTyping = false
    }
}

#Preview {
    SupportView()
}
