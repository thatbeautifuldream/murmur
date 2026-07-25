import AVFoundation

// `@unchecked Sendable`: `AVSpeechSynthesizer` itself isn't Sendable, but
// instances of this class are only ever reached from `Server`'s main-queue
// listener (see `listener?.start(queue: .main)` in Server.swift), so there's
// no cross-actor access in practice.
final class SpeechSynthesizer: NSObject, AVSpeechSynthesizerDelegate, @unchecked Sendable {
    private let synthesizer = AVSpeechSynthesizer()
    private lazy var preferredVoice: AVSpeechSynthesisVoice? = Self.pickPreferredVoice()

    /// Best on-device English voice, ranked: Alex (en-US premium, gold
    /// standard) > highest-quality installed en-US voice (premium > enhanced
    /// > default) > any English voice.
    private static func pickPreferredVoice() -> AVSpeechSynthesisVoice? {
        let voices = AVSpeechSynthesisVoice.speechVoices()

        if let alex = voices.first(where: { $0.identifier == AVSpeechSynthesisVoiceIdentifierAlex }) {
            return alex
        }

        let byQuality: (AVSpeechSynthesisVoice, AVSpeechSynthesisVoice) -> Bool = { lhs, rhs in
            lhs.quality.rawValue < rhs.quality.rawValue
        }
        if let best = voices.filter({ $0.language == "en-US" }).max(by: byQuality) {
            return best
        }

        return voices.first(where: { $0.language.hasPrefix("en") })
    }

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func speak(text: String, voiceIdentifier: String? = nil) {
        stop()
        let utterance = AVSpeechUtterance(string: text)
        if let voiceIdentifier, let voice = AVSpeechSynthesisVoice(identifier: voiceIdentifier) {
            utterance.voice = voice
        } else {
            utterance.voice = preferredVoice
        }
        synthesizer.speak(utterance)
    }

    func stop() {
        if synthesizer.isSpeaking {
            synthesizer.stopSpeaking(at: .immediate)
        }
    }

    var isSpeaking: Bool {
        synthesizer.isSpeaking
    }
}
