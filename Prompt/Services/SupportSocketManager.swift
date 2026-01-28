//
//  SupportSocketManager.swift
//  Prompt
//
//  Real-time WebSocket manager for support chat using Socket.IO
//

import Foundation
import Combine
import SocketIO

// MARK: - Support Socket Manager

@MainActor
final class SupportSocketManager: ObservableObject {
    static let shared = SupportSocketManager()

    @Published var isConnected = false
    @Published var agentIsTyping = false
    @Published var currentTicketId: String?

    private var manager: SocketManager?
    private var socket: SocketIOClient?
    private var typingTimer: Timer?
    private var pendingTicketId: String?

    // Callback for new messages
    var onMessageReceived: ((SupportMessage) -> Void)?
    var onTypingUpdate: ((Bool) -> Void)?

    private let apiURL = "https://backend-production-d538.up.railway.app"

    private init() {}

    // MARK: - Connection Management

    func connect(ticketId: String) {
        // Store the ticket ID we want to join
        pendingTicketId = ticketId

        // If already connected to this ticket, do nothing
        if currentTicketId == ticketId && isConnected {
            return
        }

        // If connected to a different ticket, leave that room first
        if let currentId = currentTicketId, currentId != ticketId, isConnected {
            leaveTicket(ticketId: currentId)
        }

        // If socket exists and is connected, just join the new room
        if let socket = socket, socket.status == .connected {
            currentTicketId = ticketId
            joinTicket(ticketId: ticketId)
            return
        }

        // Need to create a new connection
        disconnect()
        currentTicketId = ticketId

        guard let url = URL(string: apiURL) else {
            print("[SupportSocket] Invalid URL")
            return
        }

        // Configure socket manager - allow both websocket and polling for reliability
        manager = SocketManager(
            socketURL: url,
            config: [
                .log(false),
                .compress,
                .reconnects(true),
                .reconnectAttempts(5),
                .reconnectWait(3),
                .forceNew(true),
                .secure(true)
            ]
        )

        socket = manager?.defaultSocket
        setupEventHandlers()

        print("[SupportSocket] Connecting to \(apiURL)...")
        socket?.connect()
    }

    func disconnect() {
        typingTimer?.invalidate()
        typingTimer = nil

        if let socket = socket {
            if socket.status == .connected, let ticketId = currentTicketId {
                // Leave room before disconnecting
                socket.emit("leave:ticket", ["ticketId": ticketId])
            }
            socket.disconnect()
        }

        socket = nil
        manager = nil
        isConnected = false
        agentIsTyping = false
        currentTicketId = nil
        pendingTicketId = nil
    }

    // MARK: - Event Handlers

    private func setupEventHandlers() {
        guard let socket = socket else { return }

        socket.on(clientEvent: .connect) { [weak self] _, _ in
            guard let self = self else { return }

            Task { @MainActor in
                self.isConnected = true
                print("[SupportSocket] Connected successfully")

                // Join the pending ticket room
                if let ticketId = self.pendingTicketId ?? self.currentTicketId {
                    self.currentTicketId = ticketId
                    self.joinTicket(ticketId: ticketId)
                }
            }
        }

        socket.on(clientEvent: .disconnect) { [weak self] reason, _ in
            guard let self = self else { return }

            Task { @MainActor in
                self.isConnected = false
                self.agentIsTyping = false
                print("[SupportSocket] Disconnected: \(reason)")
            }
        }

        socket.on(clientEvent: .error) { data, _ in
            print("[SupportSocket] Error: \(data)")
        }

        socket.on(clientEvent: .reconnect) { [weak self] _, _ in
            guard let self = self else { return }

            Task { @MainActor in
                print("[SupportSocket] Reconnected")
                // Rejoin the room after reconnection
                if let ticketId = self.currentTicketId {
                    self.joinTicket(ticketId: ticketId)
                }
            }
        }

        socket.on(clientEvent: .reconnectAttempt) { attempt, _ in
            print("[SupportSocket] Reconnect attempt: \(attempt)")
        }

        // Listen for new messages
        socket.on("ticket:message") { [weak self] data, _ in
            guard let self = self else { return }

            Task { @MainActor in
                guard let dict = data.first as? [String: Any],
                      let ticketId = dict["ticketId"] as? String,
                      ticketId == self.currentTicketId,
                      let messageDict = dict["message"] as? [String: Any],
                      let id = messageDict["id"] as? String,
                      let role = messageDict["role"] as? String,
                      let content = messageDict["content"] as? String else {
                    return
                }

                let message = SupportMessage.fromSocket(
                    id: id,
                    role: role,
                    content: content,
                    isFromAI: messageDict["isFromAI"] as? Bool ?? false,
                    createdAt: self.parseDate(messageDict["createdAt"] as? String)
                )

                // Increment unread count for agent messages
                if role == "agent" {
                    NotificationManager.shared.handleIncomingSupportMessage()
                }

                self.onMessageReceived?(message)
            }
        }

        // Listen for typing indicators
        socket.on("typing:update") { [weak self] data, _ in
            guard let self = self else { return }

            Task { @MainActor in
                guard let dict = data.first as? [String: Any],
                      let ticketId = dict["ticketId"] as? String,
                      ticketId == self.currentTicketId,
                      let isTyping = dict["isTyping"] as? Bool,
                      let role = dict["role"] as? String,
                      role == "agent" else {
                    return
                }

                self.agentIsTyping = isTyping
                self.onTypingUpdate?(isTyping)
            }
        }

        // Listen for participant events
        socket.on("participant:joined") { data, _ in
            if let dict = data.first as? [String: Any],
               let role = dict["role"] as? String {
                print("[SupportSocket] Participant joined: \(role)")
            }
        }

        socket.on("participant:left") { [weak self] data, _ in
            guard let self = self else { return }

            if let dict = data.first as? [String: Any],
               let role = dict["role"] as? String {
                print("[SupportSocket] Participant left: \(role)")

                if role == "agent" {
                    Task { @MainActor in
                        self.agentIsTyping = false
                        self.onTypingUpdate?(false)
                    }
                }
            }
        }
    }

    // MARK: - Room Management

    private func joinTicket(ticketId: String) {
        guard let socket = socket, socket.status == .connected else {
            print("[SupportSocket] Cannot join room - not connected")
            return
        }

        socket.emit("join:ticket", [
            "ticketId": ticketId,
            "role": "user"
        ])
        print("[SupportSocket] Joining ticket room: \(ticketId)")
    }

    private func leaveTicket(ticketId: String) {
        guard let socket = socket, socket.status == .connected else {
            return
        }

        socket.emit("leave:ticket", ["ticketId": ticketId])
        print("[SupportSocket] Left ticket room: \(ticketId)")
    }

    // MARK: - Typing Indicators

    func startTyping() {
        guard let socket = socket,
              socket.status == .connected,
              let ticketId = currentTicketId else {
            return
        }

        socket.emit("typing:start", [
            "ticketId": ticketId,
            "role": "user"
        ])

        // Auto-stop typing after 2 seconds of inactivity
        typingTimer?.invalidate()
        typingTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: false) { [weak self] _ in
            Task { @MainActor in
                self?.stopTyping()
            }
        }
    }

    func stopTyping() {
        typingTimer?.invalidate()
        typingTimer = nil

        guard let socket = socket,
              socket.status == .connected,
              let ticketId = currentTicketId else {
            return
        }

        socket.emit("typing:stop", [
            "ticketId": ticketId,
            "role": "user"
        ])
    }

    // MARK: - Helpers

    private func parseDate(_ dateString: String?) -> Date? {
        guard let dateString = dateString else { return nil }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: dateString)
    }
}

// MARK: - SupportMessage Extension for Socket Data

extension SupportMessage {
    /// Initialize from socket data
    static func fromSocket(id: String, role: String, content: String, isFromAI: Bool, createdAt: Date?) -> SupportMessage {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        let dateString = createdAt.map { formatter.string(from: $0) }

        let json: [String: Any?] = [
            "id": id,
            "role": role,
            "content": content,
            "isFromAI": isFromAI,
            "createdAt": dateString
        ]

        let filteredJson = json.compactMapValues { $0 }

        if let data = try? JSONSerialization.data(withJSONObject: filteredJson),
           let message = try? JSONDecoder().decode(SupportMessage.self, from: data) {
            return message
        }

        return SupportMessage(role: role, content: content)
    }
}
