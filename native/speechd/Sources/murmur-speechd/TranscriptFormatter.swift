import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

struct TranscriptFormatter {
    func format(_ text: String) async -> String {
        let raw = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return text }

#if canImport(FoundationModels)
        if #available(macOS 26.0, *) {
            return await formatWithFoundationModels(raw) ?? raw
        }
#endif

        return raw
    }

#if canImport(FoundationModels)
    @available(macOS 26.0, *)
    private func formatWithFoundationModels(_ text: String) async -> String? {
        guard case .available = SystemLanguageModel.default.availability else {
            return nil
        }

        let session = LanguageModelSession(instructions: """
        You format raw speech-to-text transcripts for pasting.
        Preserve the speaker's meaning and wording.
        Fix punctuation, capitalization, spacing, and obvious speech-recognition artifacts.
        Remove filler words only when they do not change meaning.
        Do not add facts, explanations, markdown, or surrounding quotes.
        Return only the cleaned transcript text.
        """)

        do {
            let response = try await session.respond(to: text)
            let formatted = response.content.trimmingCharacters(in: .whitespacesAndNewlines)
            return formatted.isEmpty ? nil : formatted
        } catch {
            return nil
        }
    }
#endif
}
