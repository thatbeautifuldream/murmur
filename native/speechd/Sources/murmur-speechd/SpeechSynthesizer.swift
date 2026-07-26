import AVFoundation

// `@unchecked Sendable`: `AVSpeechSynthesizer` itself isn't Sendable, but
// instances of this class are only ever reached from `Server`'s main-queue
// listener (see `listener?.start(queue: .main)` in Server.swift), so there's
// no cross-actor access in practice.
final class SpeechSynthesizer: NSObject, AVSpeechSynthesizerDelegate, @unchecked Sendable {
    private let synthesizer = AVSpeechSynthesizer()
    private lazy var preferredVoice: AVSpeechSynthesisVoice? = Self.pickPreferredVoice()
    // `synthesizer.isSpeaking` doesn't flip to true synchronously inside
    // `speak(_:)`, so a client polling /speak/status right after enqueuing the
    // first chunk of a turn would see "not speaking" and consider the turn
    // done. Counting enqueued-but-not-finished utterances ourselves closes
    // that window.
    private var queued = 0

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

    /// Appends to the utterance queue rather than replacing it — the agent
    /// streams a reply sentence-by-sentence, so each /speak must continue the
    /// same spoken turn instead of cutting off the one still playing.
    /// `/speak/stop` is the only thing that clears the queue.
    func speak(text: String, voiceIdentifier: String? = nil) {
        let utterance = AVSpeechUtterance(string: text)
        if let voiceIdentifier, let voice = AVSpeechSynthesisVoice(identifier: voiceIdentifier) {
            utterance.voice = voice
        } else {
            utterance.voice = preferredVoice
        }
        queued += 1
        synthesizer.speak(utterance)
    }

    func stop() {
        queued = 0
        if synthesizer.isSpeaking {
            synthesizer.stopSpeaking(at: .immediate)
        }
    }

    var isSpeaking: Bool {
        queued > 0 || synthesizer.isSpeaking
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        queued = max(0, queued - 1)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        queued = max(0, queued - 1)
    }
}
