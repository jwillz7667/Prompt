//
//  SupportService.swift
//  Prompt
//
//  Service for interacting with the support AI agent and managing support tickets
//

import Foundation
import Combine

// MARK: - Models

enum TicketStatus: String, Codable, Sendable {
    case open = "OPEN"
    case inProgress = "IN_PROGRESS"
    case waitingOnUser = "WAITING_ON_USER"
    case resolved = "RESOLVED"
    case closed = "CLOSED"

    var displayName: String {
        switch self {
        case .open: return "Open"
        case .inProgress: return "In Progress"
        case .waitingOnUser: return "Waiting on You"
        case .resolved: return "Resolved"
        case .closed: return "Closed"
        }
    }

    var icon: String {
        switch self {
        case .open: return "circle"
        case .inProgress: return "arrow.triangle.2.circlepath"
        case .waitingOnUser: return "clock"
        case .resolved: return "checkmark.circle"
        case .closed: return "xmark.circle"
        }
    }
}

enum TicketPriority: String, Codable, Sendable {
    case low = "LOW"
    case medium = "MEDIUM"
    case high = "HIGH"
    case urgent = "URGENT"
}

enum TicketCategory: String, Codable, Sendable {
    case account = "ACCOUNT"
    case billing = "BILLING"
    case technical = "TECHNICAL"
    case featureRequest = "FEATURE_REQUEST"
    case bugReport = "BUG_REPORT"
    case other = "OTHER"

    var displayName: String {
        switch self {
        case .account: return "Account"
        case .billing: return "Billing"
        case .technical: return "Technical"
        case .featureRequest: return "Feature Request"
        case .bugReport: return "Bug Report"
        case .other: return "Other"
        }
    }

    var icon: String {
        switch self {
        case .account: return "person.circle"
        case .billing: return "creditcard"
        case .technical: return "wrench.and.screwdriver"
        case .featureRequest: return "lightbulb"
        case .bugReport: return "ladybug"
        case .other: return "questionmark.circle"
        }
    }
}

struct SupportMessage: Codable, Identifiable, Sendable {
    let id: String?
    let role: String
    let content: String
    let isFromAI: Bool?
    let createdAt: Date?

    var isUser: Bool {
        role == "user"
    }

    // For creating new messages locally
    init(role: String, content: String) {
        self.id = UUID().uuidString
        self.role = role
        self.content = content
        self.isFromAI = role == "assistant"
        self.createdAt = Date()
    }

    nonisolated init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(String.self, forKey: .id)
        role = try container.decode(String.self, forKey: .role)
        content = try container.decode(String.self, forKey: .content)
        isFromAI = try container.decodeIfPresent(Bool.self, forKey: .isFromAI)

        // Handle ISO date string
        if let dateString = try container.decodeIfPresent(String.self, forKey: .createdAt) {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            createdAt = formatter.date(from: dateString)
        } else {
            createdAt = nil
        }
    }

    nonisolated func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(id, forKey: .id)
        try container.encode(role, forKey: .role)
        try container.encode(content, forKey: .content)
        try container.encodeIfPresent(isFromAI, forKey: .isFromAI)
    }

    private enum CodingKeys: String, CodingKey {
        case id, role, content, isFromAI, createdAt
    }
}

struct SupportTicket: Codable, Identifiable, Sendable {
    let id: String
    let userId: String
    let subject: String
    let category: TicketCategory
    let priority: TicketPriority
    let status: TicketStatus
    let summary: String?
    let assignedAgentName: String?
    let createdAt: Date
    let updatedAt: Date
    let resolvedAt: Date?
    var messages: [SupportMessage]?

    nonisolated init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        userId = try container.decode(String.self, forKey: .userId)
        subject = try container.decode(String.self, forKey: .subject)
        category = try container.decode(TicketCategory.self, forKey: .category)
        priority = try container.decode(TicketPriority.self, forKey: .priority)
        status = try container.decode(TicketStatus.self, forKey: .status)
        summary = try container.decodeIfPresent(String.self, forKey: .summary)
        assignedAgentName = try container.decodeIfPresent(String.self, forKey: .assignedAgentName)
        messages = try container.decodeIfPresent([SupportMessage].self, forKey: .messages)

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        let createdAtString = try container.decode(String.self, forKey: .createdAt)
        createdAt = formatter.date(from: createdAtString) ?? Date()

        let updatedAtString = try container.decode(String.self, forKey: .updatedAt)
        updatedAt = formatter.date(from: updatedAtString) ?? Date()

        if let resolvedAtString = try container.decodeIfPresent(String.self, forKey: .resolvedAt) {
            resolvedAt = formatter.date(from: resolvedAtString)
        } else {
            resolvedAt = nil
        }
    }

    private enum CodingKeys: String, CodingKey {
        case id, userId, subject, category, priority, status, summary, assignedAgentName, createdAt, updatedAt, resolvedAt, messages
    }
}

// MARK: - API Request/Response Models

struct ChatRequest: Encodable, Sendable {
    let message: String
    let conversationHistory: [ConversationMessage]?

    struct ConversationMessage: Encodable, Sendable {
        let role: String
        let content: String
    }
}

struct ChatResponse: Decodable, Sendable {
    let reply: String
    let ticketCreated: Bool
    let ticketId: String?
    let category: TicketCategory?

    nonisolated init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        reply = try container.decode(String.self, forKey: .reply)
        ticketCreated = try container.decode(Bool.self, forKey: .ticketCreated)
        ticketId = try container.decodeIfPresent(String.self, forKey: .ticketId)
        category = try container.decodeIfPresent(TicketCategory.self, forKey: .category)
    }

    private enum CodingKeys: String, CodingKey {
        case reply, ticketCreated, ticketId, category
    }
}

struct TicketsResponse: Decodable, Sendable {
    let tickets: [SupportTicket]

    nonisolated init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        tickets = try container.decode([SupportTicket].self, forKey: .tickets)
    }

    private enum CodingKeys: String, CodingKey {
        case tickets
    }
}

struct TicketResponse: Decodable, Sendable {
    let ticket: SupportTicket

    nonisolated init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        ticket = try container.decode(SupportTicket.self, forKey: .ticket)
    }

    private enum CodingKeys: String, CodingKey {
        case ticket
    }
}

// MARK: - Support Service

@MainActor
final class SupportService: ObservableObject {
    static let shared = SupportService()

    @Published var isLoading = false
    @Published var error: String?
    @Published var tickets: [SupportTicket] = []
    @Published var currentTicket: SupportTicket?

    private init() {}

    // MARK: - Chat with Support AI

    func sendMessage(
        _ message: String,
        conversationHistory: [SupportMessage] = []
    ) async throws -> ChatResponse {
        isLoading = true
        error = nil

        defer { isLoading = false }

        let history = conversationHistory.map { msg in
            ChatRequest.ConversationMessage(role: msg.role, content: msg.content)
        }

        let request = ChatRequest(
            message: message,
            conversationHistory: history.isEmpty ? nil : history
        )

        do {
            let response: ChatResponse = try await APIClient.shared.request(
                "/support/chat",
                method: .post,
                body: request
            )
            return response
        } catch {
            self.error = error.localizedDescription
            throw error
        }
    }

    // MARK: - Continue Chat on Ticket

    func sendMessageToTicket(
        ticketId: String,
        message: String
    ) async throws -> ChatResponse {
        isLoading = true
        error = nil

        defer { isLoading = false }

        struct TicketChatRequest: Encodable {
            let message: String
        }

        do {
            let response: ChatResponse = try await APIClient.shared.request(
                "/support/tickets/\(ticketId)/chat",
                method: .post,
                body: TicketChatRequest(message: message)
            )
            return response
        } catch {
            self.error = error.localizedDescription
            throw error
        }
    }

    // MARK: - Get Tickets

    func fetchTickets() async throws {
        isLoading = true
        error = nil

        defer { isLoading = false }

        do {
            let response: TicketsResponse = try await APIClient.shared.request(
                "/support/tickets",
                method: .get
            )
            tickets = response.tickets
        } catch {
            self.error = error.localizedDescription
            throw error
        }
    }

    // MARK: - Get Single Ticket

    func fetchTicket(id: String) async throws -> SupportTicket {
        isLoading = true
        error = nil

        defer { isLoading = false }

        do {
            let response: TicketResponse = try await APIClient.shared.request(
                "/support/tickets/\(id)",
                method: .get
            )
            currentTicket = response.ticket
            return response.ticket
        } catch {
            self.error = error.localizedDescription
            throw error
        }
    }
}
