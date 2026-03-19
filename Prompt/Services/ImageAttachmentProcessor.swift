//
//  ImageAttachmentProcessor.swift
//  Prompt
//
//  Downsamples and compresses user-selected images before upload.
//

import Foundation
import ImageIO
import UIKit

enum ImageAttachmentProcessorError: LocalizedError {
    case failedToLoad
    case invalidImage
    case compressionFailed

    var errorDescription: String? {
        switch self {
        case .failedToLoad:
            return "Could not load the selected image."
        case .invalidImage:
            return "The selected file is not a supported image."
        case .compressionFailed:
            return "The image could not be prepared for upload."
        }
    }
}

enum ImageAttachmentProcessor {
    private static let maxPixelSize = 1_280
    private static let maxByteCount = 900_000

    static func process(data: Data) throws -> PromptImageAttachment {
        guard let image = downsampledImage(from: data, maxPixelSize: maxPixelSize) else {
            throw ImageAttachmentProcessorError.invalidImage
        }

        guard let compressedData = compressedJPEGData(from: image) else {
            throw ImageAttachmentProcessorError.compressionFailed
        }

        return PromptImageAttachment(
            dataUrl: "data:image/jpeg;base64,\(compressedData.base64EncodedString())",
            mimeType: "image/jpeg",
            width: Int(image.size.width.rounded()),
            height: Int(image.size.height.rounded()),
            analysis: nil
        )
    }

    private static func downsampledImage(from data: Data, maxPixelSize: Int) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else {
            return UIImage(data: data)
        }

        let options: CFDictionary = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
        ] as CFDictionary

        if let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options) {
            return UIImage(cgImage: thumbnail)
        }

        return UIImage(data: data)
    }

    private static func compressedJPEGData(from image: UIImage) -> Data? {
        let qualities: [CGFloat] = [0.82, 0.72, 0.64, 0.56, 0.48]

        for quality in qualities {
            if let data = image.jpegData(compressionQuality: quality), data.count <= maxByteCount {
                return data
            }
        }

        return image.jpegData(compressionQuality: 0.42)
    }
}
