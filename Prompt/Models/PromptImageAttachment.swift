//
//  PromptImageAttachment.swift
//  Prompt
//
//  Shared image attachment model for prompt generation and history persistence.
//

import Foundation
import UIKit

struct PromptImageAttachment: Codable, Sendable, Equatable {
    let dataUrl: String
    let mimeType: String
    let width: Int
    let height: Int
    let analysis: String?

    var imageData: Data? {
        Self.decodeDataURL(dataUrl)
    }

    var uiImage: UIImage? {
        guard let imageData else { return nil }
        return UIImage(data: imageData)
    }

    var aspectRatio: CGFloat {
        guard height > 0 else { return 1 }
        return CGFloat(width) / CGFloat(height)
    }

    var hasAnalysis: Bool {
        !(analysis?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
    }

    static func decodeDataURL(_ value: String) -> Data? {
        guard let commaIndex = value.firstIndex(of: ",") else {
            return nil
        }

        let base64 = String(value[value.index(after: commaIndex)...])
        return Data(base64Encoded: base64)
    }
}
