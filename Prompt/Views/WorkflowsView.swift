import SwiftUI

struct WorkflowsView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    @StateObject private var service = WorkflowService.shared

    @State private var showCreateSheet = false
    @State private var showTemplateSheet = false
    @State private var showImportSheet = false
    @State private var selectedWorkflow: Workflow?
    @State private var statusFilter: WorkflowStatus?
    @State private var showDeleteConfirmation = false
    @State private var workflowToDelete: Workflow?

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    private var filteredWorkflows: [Workflow] {
        guard let filter = statusFilter else { return service.workflows }
        return service.workflows.filter { $0.status == filter }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                Group {
                    if service.isLoading && service.workflows.isEmpty {
                        loadingView
                    } else if service.workflows.isEmpty {
                        emptyStateView
                    } else {
                        workflowsList
                    }
                }
            }
            .navigationTitle("Workflows")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(accentColor)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button {
                            showCreateSheet = true
                        } label: {
                            Label("New Workflow", systemImage: "plus")
                        }
                        Button {
                            showTemplateSheet = true
                        } label: {
                            Label("Templates", systemImage: "doc.text")
                        }
                        Button {
                            showImportSheet = true
                        } label: {
                            Label("Import JSON", systemImage: "square.and.arrow.down")
                        }
                    } label: {
                        Image(systemName: "plus")
                            .foregroundStyle(accentColor)
                    }
                }
            }
            .task { await service.loadWorkflowsIfNeeded() }
            .sheet(isPresented: $showCreateSheet) {
                CreateWorkflowSheet(service: service)
            }
            .sheet(isPresented: $showTemplateSheet) {
                TemplateLibrarySheet(service: service)
            }
            .sheet(isPresented: $showImportSheet) {
                ImportWorkflowSheet(service: service)
            }
            .sheet(item: $selectedWorkflow) { workflow in
                WorkflowDetailSheet(workflow: workflow, service: service)
            }
            .alert("Delete Workflow", isPresented: $showDeleteConfirmation) {
                Button("Delete", role: .destructive) {
                    if let wf = workflowToDelete {
                        Task { try? await service.deleteWorkflow(id: wf.id) }
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This workflow and all its executions will be permanently deleted.")
            }
        }
    }

    // MARK: - Workflows List

    private var workflowsList: some View {
        ScrollView {
            VStack(spacing: 12) {
                // Status filters
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        filterChip(label: "All", isSelected: statusFilter == nil) {
                            statusFilter = nil
                        }
                        ForEach(WorkflowStatus.allCases, id: \.self) { status in
                            filterChip(label: status.displayName, isSelected: statusFilter == status) {
                                statusFilter = statusFilter == status ? nil : status
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                }

                LazyVStack(spacing: 12) {
                    ForEach(filteredWorkflows) { workflow in
                        workflowCard(workflow)
                    }
                }
                .padding(.horizontal, 20)
            }
            .padding(.top, 12)
            .padding(.bottom, 100)
        }
        .refreshable {
            _ = try? await service.listWorkflows()
        }
    }

    private func workflowCard(_ workflow: Workflow) -> some View {
        Button {
            selectedWorkflow = workflow
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Image(systemName: workflow.status.icon)
                        .foregroundStyle(statusColor(workflow.status))
                    Text(workflow.name)
                        .font(.system(.headline, design: .rounded))
                        .foregroundStyle(textPrimary)
                        .lineLimit(1)
                    Spacer()

                    Text(workflow.status.displayName)
                        .font(.system(.caption2, design: .rounded, weight: .semibold))
                        .foregroundStyle(statusColor(workflow.status))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(statusColor(workflow.status).opacity(0.12))
                        .clipShape(Capsule())
                }

                if let desc = workflow.description, !desc.isEmpty {
                    Text(desc)
                        .font(.system(.subheadline, design: .rounded))
                        .foregroundStyle(textSecondary)
                        .lineLimit(2)
                }

                HStack {
                    Label("\(workflow.steps.count) steps", systemImage: "list.number")
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(textTertiary)

                    if let count = workflow._count?.executions {
                        Label("\(count) runs", systemImage: "play.circle")
                            .font(.system(.caption, design: .rounded))
                            .foregroundStyle(textTertiary)
                    }

                    Spacer()

                    Text(workflow.updatedAt.formatted(date: .abbreviated, time: .omitted))
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(textTertiary)
                }
            }
            .padding(16)
            .liquidGlass(cornerRadius: 16)
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button {
                Task {
                    _ = try? await service.cloneWorkflow(id: workflow.id)
                }
            } label: {
                Label("Clone", systemImage: "doc.on.doc")
            }
            Button(role: .destructive) {
                workflowToDelete = workflow
                showDeleteConfirmation = true
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    private func filterChip(label: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(.caption, design: .rounded, weight: .semibold))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .liquidGlassChip(isSelected: isSelected, accentColor: accentColor)
        }
        .buttonStyle(.plain)
    }

    private func statusColor(_ status: WorkflowStatus) -> Color {
        switch status {
        case .draft: return textTertiary
        case .active: return .green
        case .paused: return .orange
        case .completed: return accentColor
        case .archived: return textTertiary
        }
    }

    // MARK: - States

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView().tint(accentColor)
            Text("Loading workflows...")
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(textSecondary)
        }
    }

    private var emptyStateView: some View {
        VStack(spacing: 20) {
            Image(systemName: "arrow.triangle.branch")
                .font(.system(size: 48, weight: .light))
                .foregroundStyle(accentColor.opacity(0.6))

            Text("No Workflows")
                .font(.system(.title3, design: .rounded, weight: .semibold))
                .foregroundStyle(textPrimary)

            Text("Create multi-step prompt workflows to automate complex tasks.")
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(textSecondary)
                .multilineTextAlignment(.center)

            HStack(spacing: 12) {
                Button {
                    showCreateSheet = true
                } label: {
                    Label("New Workflow", systemImage: "plus")
                        .font(.system(.body, design: .rounded, weight: .semibold))
                }
                .buttonStyle(GlassPrimaryButtonStyle())

                Button {
                    showTemplateSheet = true
                } label: {
                    Label("Templates", systemImage: "doc.text")
                        .font(.system(.body, design: .rounded, weight: .semibold))
                }
                .buttonStyle(GlassSecondaryButtonStyle())
            }
        }
        .padding(40)
    }
}

// MARK: - Create Workflow Sheet

private struct CreateWorkflowSheet: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    let service: WorkflowService

    @State private var name = ""
    @State private var description = ""
    @State private var steps: [StepDraft] = [StepDraft()]
    @State private var isSaving = false

    struct StepDraft: Identifiable {
        let id = UUID()
        var name: String = ""
        var promptTemplate: String = ""
        var outputFormat: String = "plain"
    }

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    var body: some View {
        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                ScrollView {
                    VStack(spacing: 20) {
                        // Name & description
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Name")
                                .font(.system(.caption, design: .rounded, weight: .semibold))
                                .foregroundStyle(textSecondary)
                            TextField("Workflow name", text: $name)
                                .font(.body)
                                .foregroundStyle(textPrimary)
                                .padding(14)
                                .liquidGlassInput(cornerRadius: 12)
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text("Description")
                                .font(.system(.caption, design: .rounded, weight: .semibold))
                                .foregroundStyle(textSecondary)
                            TextField("Optional description", text: $description)
                                .font(.body)
                                .foregroundStyle(textPrimary)
                                .padding(14)
                                .liquidGlassInput(cornerRadius: 12)
                        }

                        // Steps editor
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text("Steps")
                                    .font(.system(.caption, design: .rounded, weight: .semibold))
                                    .foregroundStyle(textSecondary)
                                Spacer()
                                Button {
                                    steps.append(StepDraft())
                                } label: {
                                    Image(systemName: "plus.circle.fill")
                                        .foregroundStyle(accentColor)
                                }
                            }

                            ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                                stepEditor(index: index)
                            }
                        }

                        Button {
                            Task { await save() }
                        } label: {
                            if isSaving {
                                HStack {
                                    ProgressView().tint(.white)
                                    Text("Creating...")
                                }
                            } else {
                                Label("Create Workflow", systemImage: "checkmark")
                                    .font(.system(.body, design: .rounded, weight: .semibold))
                            }
                        }
                        .buttonStyle(GlassPrimaryButtonStyle())
                        .disabled(name.isEmpty || steps.allSatisfy { $0.name.isEmpty } || isSaving)
                    }
                    .padding(20)
                    .padding(.bottom, 100)
                }
            }
            .navigationTitle("New Workflow")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(textSecondary)
                }
            }
        }
    }

    private func stepEditor(index: Int) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Step \(index + 1)")
                    .font(.system(.caption, design: .rounded, weight: .bold))
                    .foregroundStyle(accentColor)
                Spacer()
                if steps.count > 1 {
                    Button {
                        steps.remove(at: index)
                    } label: {
                        Image(systemName: "minus.circle.fill")
                            .foregroundStyle(.red.opacity(0.7))
                    }
                }
            }

            TextField("Step name", text: $steps[index].name)
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(textPrimary)
                .padding(10)
                .liquidGlassInput(cornerRadius: 8)

            TextEditor(text: $steps[index].promptTemplate)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(textPrimary)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 60, maxHeight: 120)
                .padding(10)
                .liquidGlassInput(cornerRadius: 8)

            Picker("Output Format", selection: $steps[index].outputFormat) {
                Text("Plain").tag("plain")
                Text("JSON").tag("json")
                Text("Markdown").tag("markdown")
                Text("Code").tag("code")
            }
            .pickerStyle(.segmented)
        }
        .padding(14)
        .liquidGlass(cornerRadius: 14)
    }

    private func save() async {
        isSaving = true
        let stepRequests = steps.filter { !$0.name.isEmpty }.map { step in
            CreateWorkflowRequest.WorkflowStepRequest(
                name: step.name,
                promptTemplate: step.promptTemplate,
                outputFormat: step.outputFormat
            )
        }
        let request = CreateWorkflowRequest(
            name: name,
            description: description.isEmpty ? nil : description,
            steps: stepRequests
        )

        do {
            _ = try await service.createWorkflow(request: request)
            dismiss()
        } catch {
            print("Failed to create workflow: \(error)")
        }
        isSaving = false
    }
}

// MARK: - Workflow Detail Sheet

private struct WorkflowDetailSheet: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    let workflow: Workflow
    let service: WorkflowService

    @State private var executions: [WorkflowExecution] = []
    @State private var showExecuteSheet = false
    @State private var selectedExecution: WorkflowExecution?
    @State private var isLoadingExecutions = false
    @State private var showExportSheet = false
    @State private var exportedJSON = ""

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    var body: some View {
        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                ScrollView {
                    VStack(spacing: 16) {
                        // Header
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Image(systemName: workflow.status.icon)
                                    .foregroundStyle(accentColor)
                                Text(workflow.name)
                                    .font(.system(.title3, design: .rounded, weight: .bold))
                                    .foregroundStyle(textPrimary)
                            }
                            if let desc = workflow.description, !desc.isEmpty {
                                Text(desc)
                                    .font(.system(.subheadline, design: .rounded))
                                    .foregroundStyle(textSecondary)
                            }
                        }
                        .padding(20)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .liquidGlass(cornerRadius: 20, borderGlow: true)

                        // Steps
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Steps (\(workflow.steps.count))")
                                .font(.system(.subheadline, design: .rounded, weight: .semibold))
                                .foregroundStyle(textSecondary)

                            ForEach(workflow.steps.sorted(by: { $0.stepOrder < $1.stepOrder })) { step in
                                stepRow(step)
                            }
                        }

                        // Actions
                        VStack(spacing: 10) {
                            Button {
                                showExecuteSheet = true
                            } label: {
                                Label("Execute", systemImage: "play.fill")
                                    .font(.system(.body, design: .rounded, weight: .semibold))
                            }
                            .buttonStyle(GlassPrimaryButtonStyle())

                            HStack(spacing: 10) {
                                Button {
                                    Task {
                                        _ = try? await service.cloneWorkflow(id: workflow.id)
                                        dismiss()
                                    }
                                } label: {
                                    Label("Clone", systemImage: "doc.on.doc")
                                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                                }
                                .buttonStyle(GlassSecondaryButtonStyle())

                                Button {
                                    Task { await exportWorkflow() }
                                } label: {
                                    Label("Export", systemImage: "square.and.arrow.up")
                                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                                }
                                .buttonStyle(GlassSecondaryButtonStyle())
                            }
                        }

                        // Execution History
                        if !executions.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Execution History")
                                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                                    .foregroundStyle(textSecondary)

                                ForEach(executions) { execution in
                                    executionRow(execution)
                                }
                            }
                        }
                    }
                    .padding(20)
                    .padding(.bottom, 100)
                }
            }
            .navigationTitle("Workflow")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(accentColor)
                }
            }
            .task { await loadExecutions() }
            .sheet(isPresented: $showExecuteSheet) {
                ExecuteWorkflowSheet(workflow: workflow, service: service)
            }
            .sheet(item: $selectedExecution) { execution in
                ExecutionDetailSheet(execution: execution, service: service)
            }
            .sheet(isPresented: $showExportSheet) {
                ExportSheet(json: exportedJSON)
            }
        }
    }

    private func stepRow(_ step: WorkflowStep) -> some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle()
                    .fill(accentColor.opacity(0.15))
                    .frame(width: 28, height: 28)
                Text("\(step.stepOrder)")
                    .font(.system(.caption, design: .rounded, weight: .bold))
                    .foregroundStyle(accentColor)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(step.name)
                    .font(.system(.subheadline, design: .rounded, weight: .medium))
                    .foregroundStyle(textPrimary)
                Text(step.promptTemplate)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(textSecondary)
                    .lineLimit(2)
                if let format = step.outputFormat {
                    Text(format.uppercased())
                        .font(.system(.caption2, design: .rounded, weight: .bold))
                        .foregroundStyle(textTertiary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.ultraThinMaterial)
                        .clipShape(Capsule())
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .liquidGlass(cornerRadius: 12)
    }

    private func executionRow(_ execution: WorkflowExecution) -> some View {
        Button {
            selectedExecution = execution
        } label: {
            HStack {
                Image(systemName: executionStatusIcon(execution.status))
                    .foregroundStyle(executionStatusColor(execution.status))

                VStack(alignment: .leading, spacing: 2) {
                    Text("Run \(execution.id.prefix(8))...")
                        .font(.system(.subheadline, design: .rounded, weight: .medium))
                        .foregroundStyle(textPrimary)
                    Text(execution.startedAt.formatted(date: .abbreviated, time: .shortened))
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(textTertiary)
                }

                Spacer()

                Text(execution.status.capitalized)
                    .font(.system(.caption2, design: .rounded, weight: .semibold))
                    .foregroundStyle(executionStatusColor(execution.status))
            }
            .padding(12)
            .liquidGlass(cornerRadius: 12)
        }
        .buttonStyle(.plain)
    }

    private func executionStatusIcon(_ status: String) -> String {
        switch status {
        case "completed": return "checkmark.circle.fill"
        case "running": return "arrow.circlepath"
        case "failed": return "xmark.circle.fill"
        default: return "clock"
        }
    }

    private func executionStatusColor(_ status: String) -> Color {
        switch status {
        case "completed": return .green
        case "running": return .orange
        case "failed": return .red
        default: return textTertiary
        }
    }

    private func loadExecutions() async {
        isLoadingExecutions = true
        do {
            executions = try await service.listExecutions(workflowId: workflow.id)
        } catch {
            print("Failed to load executions: \(error)")
        }
        isLoadingExecutions = false
    }

    private func exportWorkflow() async {
        do {
            exportedJSON = try await service.exportWorkflow(id: workflow.id)
            showExportSheet = true
        } catch {
            print("Failed to export: \(error)")
        }
    }
}

// MARK: - Execute Workflow Sheet

private struct ExecuteWorkflowSheet: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    let workflow: Workflow
    let service: WorkflowService

    @State private var contextKeys: [String] = [""]
    @State private var contextValues: [String] = [""]
    @State private var parallelSteps = false
    @State private var continueOnError = false
    @State private var maxRetries = 1
    @State private var isExecuting = false

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    var body: some View {
        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                ScrollView {
                    VStack(spacing: 20) {
                        // Initial context
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text("Initial Context")
                                    .font(.system(.caption, design: .rounded, weight: .semibold))
                                    .foregroundStyle(textSecondary)
                                Spacer()
                                Button {
                                    contextKeys.append("")
                                    contextValues.append("")
                                } label: {
                                    Image(systemName: "plus.circle.fill")
                                        .foregroundStyle(accentColor)
                                }
                            }

                            ForEach(0..<contextKeys.count, id: \.self) { index in
                                HStack(spacing: 8) {
                                    TextField("Key", text: $contextKeys[index])
                                        .font(.system(.subheadline, design: .monospaced))
                                        .padding(10)
                                        .liquidGlassInput(cornerRadius: 8)

                                    TextField("Value", text: $contextValues[index])
                                        .font(.system(.subheadline, design: .monospaced))
                                        .padding(10)
                                        .liquidGlassInput(cornerRadius: 8)

                                    if contextKeys.count > 1 {
                                        Button {
                                            contextKeys.remove(at: index)
                                            contextValues.remove(at: index)
                                        } label: {
                                            Image(systemName: "minus.circle.fill")
                                                .foregroundStyle(.red.opacity(0.7))
                                        }
                                    }
                                }
                            }
                        }

                        // Options
                        VStack(spacing: 12) {
                            Toggle(isOn: $parallelSteps) {
                                Text("Run Steps in Parallel")
                                    .font(.system(.subheadline, design: .rounded))
                                    .foregroundStyle(textPrimary)
                            }
                            .tint(accentColor)

                            Toggle(isOn: $continueOnError) {
                                Text("Continue on Error")
                                    .font(.system(.subheadline, design: .rounded))
                                    .foregroundStyle(textPrimary)
                            }
                            .tint(accentColor)

                            Stepper(value: $maxRetries, in: 0...5) {
                                HStack {
                                    Text("Max Retries")
                                        .font(.system(.subheadline, design: .rounded))
                                        .foregroundStyle(textPrimary)
                                    Spacer()
                                    Text("\(maxRetries)")
                                        .font(.system(.subheadline, design: .monospaced, weight: .bold))
                                        .foregroundStyle(accentColor)
                                }
                            }
                        }
                        .padding(14)
                        .liquidGlass(cornerRadius: 14)

                        Button {
                            Task { await execute() }
                        } label: {
                            if isExecuting {
                                HStack {
                                    ProgressView().tint(.white)
                                    Text("Executing...")
                                }
                            } else {
                                Label("Execute Workflow", systemImage: "play.fill")
                                    .font(.system(.body, design: .rounded, weight: .semibold))
                            }
                        }
                        .buttonStyle(GlassPrimaryButtonStyle())
                        .disabled(isExecuting)
                    }
                    .padding(20)
                    .padding(.bottom, 100)
                }
            }
            .navigationTitle("Execute")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(textSecondary)
                }
            }
        }
    }

    private func execute() async {
        isExecuting = true
        var context: [String: Any] = [:]
        for (index, key) in contextKeys.enumerated() where !key.isEmpty {
            context[key] = contextValues[index]
        }

        let request = ExecuteWorkflowRequest(
            initialContext: context.isEmpty ? nil : context,
            parallelSteps: parallelSteps,
            continueOnError: continueOnError,
            maxRetries: maxRetries
        )

        do {
            _ = try await service.executeWorkflow(id: workflow.id, request: request)
            dismiss()
        } catch {
            print("Failed to execute workflow: \(error)")
        }
        isExecuting = false
    }
}

// MARK: - Execution Detail Sheet

private struct ExecutionDetailSheet: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    let execution: WorkflowExecution
    let service: WorkflowService

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    var body: some View {
        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        // Status header
                        HStack {
                            Image(systemName: execution.status == "completed" ? "checkmark.circle.fill" : "xmark.circle.fill")
                                .foregroundStyle(execution.status == "completed" ? .green : .red)
                                .font(.system(size: 24))
                            VStack(alignment: .leading) {
                                Text(execution.status.capitalized)
                                    .font(.system(.headline, design: .rounded))
                                    .foregroundStyle(textPrimary)
                                Text("Started \(execution.startedAt.formatted())")
                                    .font(.system(.caption, design: .rounded))
                                    .foregroundStyle(textTertiary)
                            }
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .liquidGlass(cornerRadius: 16, borderGlow: true)

                        // Step results timeline
                        if let results = execution.stepResults {
                            VStack(alignment: .leading, spacing: 0) {
                                Text("Step Results")
                                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                                    .foregroundStyle(textSecondary)
                                    .padding(.bottom, 12)

                                ForEach(Array(results.enumerated()), id: \.offset) { index, result in
                                    stepResultRow(result, isLast: index == results.count - 1)
                                }
                            }
                        }

                        if let error = execution.error {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Error")
                                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                                    .foregroundStyle(.red)
                                Text(error)
                                    .font(.system(.caption, design: .monospaced))
                                    .foregroundStyle(textPrimary)
                                    .textSelection(.enabled)
                            }
                            .padding(14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.red.opacity(0.08))
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                    }
                    .padding(20)
                    .padding(.bottom, 100)
                }
            }
            .navigationTitle("Execution")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(accentColor)
                }
            }
        }
    }

    private func stepResultRow(_ result: StepExecutionResult, isLast: Bool) -> some View {
        HStack(alignment: .top, spacing: 12) {
            // Timeline
            VStack(spacing: 0) {
                ZStack {
                    Circle()
                        .fill(result.success ? Color.green : Color.red)
                        .frame(width: 12, height: 12)
                    Image(systemName: result.success ? "checkmark" : "xmark")
                        .font(.system(size: 6, weight: .bold))
                        .foregroundStyle(.white)
                }
                if !isLast {
                    Rectangle()
                        .fill(textTertiary.opacity(0.3))
                        .frame(width: 2)
                        .frame(maxHeight: .infinity)
                }
            }
            .frame(width: 12)

            VStack(alignment: .leading, spacing: 6) {
                Text(result.stepName)
                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                    .foregroundStyle(textPrimary)

                if !result.output.isEmpty {
                    Text(result.output)
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(textSecondary)
                        .lineLimit(3)
                        .textSelection(.enabled)
                }

                HStack(spacing: 12) {
                    Label("\(result.duration)ms", systemImage: "clock")
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(textTertiary)
                    if let tokens = result.tokens {
                        Label("\(tokens) tokens", systemImage: "number")
                            .font(.system(.caption2, design: .rounded))
                            .foregroundStyle(textTertiary)
                    }
                }

                if let error = result.error {
                    Text(error)
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(.red)
                }
            }
            .padding(.bottom, isLast ? 0 : 16)
        }
    }
}

// MARK: - Template Library Sheet

private struct TemplateLibrarySheet: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    let service: WorkflowService

    @State private var templates: [WorkflowTemplate] = []
    @State private var isLoading = true

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var textTertiary: Color { Color.adaptiveTextTertiary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    var body: some View {
        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                if isLoading {
                    ProgressView().tint(accentColor)
                } else if templates.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "doc.text")
                            .font(.system(size: 40, weight: .light))
                            .foregroundStyle(textTertiary)
                        Text("No templates available")
                            .font(.system(.subheadline, design: .rounded))
                            .foregroundStyle(textSecondary)
                    }
                } else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(templates) { template in
                                templateCard(template)
                            }
                        }
                        .padding(20)
                        .padding(.bottom, 100)
                    }
                }
            }
            .navigationTitle("Templates")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(accentColor)
                }
            }
            .task {
                do {
                    templates = try await service.loadTemplates()
                } catch {
                    print("Failed to load templates: \(error)")
                }
                isLoading = false
            }
        }
    }

    private func templateCard(_ template: WorkflowTemplate) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(template.name)
                .font(.system(.headline, design: .rounded))
                .foregroundStyle(textPrimary)

            Text(template.description)
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(textSecondary)
                .lineLimit(3)

            HStack {
                Label("\(template.steps.count) steps", systemImage: "list.number")
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(textTertiary)

                Spacer()

                Button {
                    Task { await useTemplate(template) }
                } label: {
                    Text("Use Template")
                        .font(.system(.caption, design: .rounded, weight: .semibold))
                }
                .buttonStyle(GlassCapsuleButtonStyle())
            }
        }
        .padding(16)
        .liquidGlass(cornerRadius: 16)
    }

    private func useTemplate(_ template: WorkflowTemplate) async {
        let steps = template.steps.map { step in
            CreateWorkflowRequest.WorkflowStepRequest(
                name: step.name,
                promptTemplate: step.promptTemplate,
                outputFormat: step.outputFormat
            )
        }
        let request = CreateWorkflowRequest(
            name: template.name,
            description: template.description,
            steps: steps
        )
        do {
            _ = try await service.createWorkflow(request: request)
            dismiss()
        } catch {
            print("Failed to use template: \(error)")
        }
    }
}

// MARK: - Import Workflow Sheet

private struct ImportWorkflowSheet: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    let service: WorkflowService

    @State private var jsonText = ""
    @State private var isImporting = false
    @State private var importError: String?

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    var body: some View {
        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                VStack(spacing: 20) {
                    TextEditor(text: $jsonText)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(textPrimary)
                        .scrollContentBackground(.hidden)
                        .frame(maxHeight: .infinity)
                        .padding(14)
                        .liquidGlassInput(cornerRadius: 12)

                    if let error = importError {
                        Text(error)
                            .font(.system(.caption, design: .rounded))
                            .foregroundStyle(.red)
                    }

                    Button {
                        Task { await importWorkflow() }
                    } label: {
                        if isImporting {
                            ProgressView().tint(.white)
                        } else {
                            Label("Import", systemImage: "square.and.arrow.down")
                                .font(.system(.body, design: .rounded, weight: .semibold))
                        }
                    }
                    .buttonStyle(GlassPrimaryButtonStyle())
                    .disabled(jsonText.isEmpty || isImporting)
                }
                .padding(20)
            }
            .navigationTitle("Import Workflow")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(textSecondary)
                }
            }
        }
    }

    private func importWorkflow() async {
        isImporting = true
        importError = nil
        do {
            _ = try await service.importWorkflow(json: jsonText)
            dismiss()
        } catch {
            importError = "Failed to import: \(error.localizedDescription)"
        }
        isImporting = false
    }
}

// MARK: - Export Sheet

private struct ExportSheet: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss
    let json: String

    @State private var showCopied = false

    private var textPrimary: Color { Color.adaptiveTextPrimary }
    private var textSecondary: Color { Color.adaptiveTextSecondary }
    private var accentColor: Color { colorScheme == .dark ? Color.brandCyan : Color.brandPurple }

    var body: some View {
        NavigationStack {
            ZStack {
                LiquidGlassBackground()

                VStack(spacing: 16) {
                    ScrollView {
                        Text(json)
                            .font(.system(.caption, design: .monospaced))
                            .foregroundStyle(textPrimary)
                            .textSelection(.enabled)
                            .padding(14)
                    }
                    .liquidGlass(cornerRadius: 12)

                    Button {
                        UIPasteboard.general.string = json
                        showCopied = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                            showCopied = false
                        }
                    } label: {
                        Label(showCopied ? "Copied!" : "Copy JSON", systemImage: showCopied ? "checkmark" : "doc.on.doc")
                            .font(.system(.body, design: .rounded, weight: .semibold))
                    }
                    .buttonStyle(GlassPrimaryButtonStyle())
                }
                .padding(20)
            }
            .navigationTitle("Export")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(accentColor)
                }
            }
        }
    }
}
