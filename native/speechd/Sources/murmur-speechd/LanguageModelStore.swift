import CryptoKit
import Foundation
import Speech

/// Compiles the user's per-mode vocabulary into a trained on-device custom
/// language model (macOS 14+), far stronger for domain terms than the
/// per-request `contextualStrings` bias alone.
///
/// Preparation is heavy and async, so it never blocks `start()`: the first
/// session with a new vocabulary falls back to `contextualStrings` while the
/// model compiles in the background; subsequent sessions use the trained model.
@available(macOS 14, *)
final class LanguageModelStore {
    static let shared = LanguageModelStore()

    private let identifier = "com.milind.murmur.customlm"
    private let cacheDir: URL
    private let queue = DispatchQueue(label: "murmur.languagemodel")
    private var preparing: Set<String> = []
    private var ready: [String: SFSpeechLanguageModel.Configuration] = [:]

    private init() {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        cacheDir = base.appendingPathComponent("murmur-speechd/lm", isDirectory: true)
        try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
    }

    /// Returns a prepared configuration if one exists for this vocabulary, else
    /// nil (and kicks off background preparation for next time).
    func configuration(for vocabulary: [String], locale: String) -> SFSpeechLanguageModel.Configuration? {
        guard !vocabulary.isEmpty else { return nil }
        let key = hash(vocabulary + [locale])

        return queue.sync {
            if let config = ready[key] { return config }
            if let config = loadPrepared(key: key) {
                ready[key] = config
                return config
            }
            prepareIfNeeded(key: key, vocabulary: vocabulary, locale: locale)
            return nil
        }
    }

    private func loadPrepared(key: String) -> SFSpeechLanguageModel.Configuration? {
        let modelURL = cacheDir.appendingPathComponent("\(key).lm")
        guard FileManager.default.fileExists(atPath: modelURL.path) else { return nil }
        return SFSpeechLanguageModel.Configuration(languageModel: modelURL)
    }

    /// Caller holds `queue`.
    private func prepareIfNeeded(key: String, vocabulary: [String], locale: String) {
        guard !preparing.contains(key) else { return }
        preparing.insert(key)

        Task.detached(priority: .utility) { [self] in
            defer { queue.sync { _ = preparing.remove(key) } }
            do {
                let dataURL = cacheDir.appendingPathComponent("\(key).bin")
                let modelURL = cacheDir.appendingPathComponent("\(key).lm")

                let data = SFCustomLanguageModelData(
                    locale: Locale(identifier: locale),
                    identifier: identifier,
                    version: "1.0"
                ) {
                    for phrase in vocabulary {
                        SFCustomLanguageModelData.PhraseCount(phrase: phrase, count: 10)
                    }
                }
                try await data.export(to: dataURL)

                let config = SFSpeechLanguageModel.Configuration(languageModel: modelURL)
                try await SFSpeechLanguageModel.prepareCustomLanguageModel(
                    for: dataURL,
                    clientIdentifier: identifier,
                    configuration: config
                )
                queue.sync { ready[key] = config }
            } catch {
                FileHandle.standardError.write(Data("custom LM prepare failed: \(error)\n".utf8))
            }
        }
    }

    private func hash(_ parts: [String]) -> String {
        let digest = SHA256.hash(data: Data(parts.joined(separator: "\u{0}").utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}
