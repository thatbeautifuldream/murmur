import AVFoundation
import Speech

final class SpeechEngine {
    private let audioEngine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var audioFile: AVAudioFile?
    private var recordingPath: String?
    private var latestText = ""

    func requestAuthorization(_ completion: @escaping (Bool) -> Void) {
        SFSpeechRecognizer.requestAuthorization { status in
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                completion(status == .authorized && granted)
            }
        }
    }

    func start(locale: String = "en-US", recordingPath: String? = nil) throws {
        stopEngineIfNeeded()

        let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale))
        guard let recognizer, recognizer.isAvailable else {
            throw SpeechError.recognizerUnavailable
        }
        self.recognizer = recognizer

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        self.request = request
        latestText = ""

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        self.recordingPath = recordingPath
        if let recordingPath, !recordingPath.isEmpty {
            audioFile = try AVAudioFile(
                forWriting: URL(fileURLWithPath: recordingPath),
                settings: format.settings
            )
        }
        input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
            self?.request?.append(buffer)
            try? self?.audioFile?.write(from: buffer)
        }

        audioEngine.prepare()
        try audioEngine.start()

        task = recognizer.recognitionTask(with: request) { [weak self] result, _ in
            guard let self, let result else { return }
            self.latestText = result.bestTranscription.formattedString
        }
    }

    func peekLatestText() -> String {
        latestText
    }

    func stop() -> SpeechResult {
        stopEngineIfNeeded()
        return SpeechResult(text: latestText, audioPath: recordingPath)
    }

    private func stopEngineIfNeeded() {
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        // Always remove the tap, not just when the engine is running: a prior
        // start() that installed a tap but never got the engine running (a
        // failed start, or a second trigger racing the first) would otherwise
        // leave a stale tap, and the next installTap aborts the process with
        // "required condition is false: nullptr == Tap()". removeTap is a safe
        // no-op when no tap is installed.
        audioEngine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        audioFile = nil
    }
}

struct SpeechResult {
    let text: String
    let audioPath: String?
}

enum SpeechError: Error {
    case recognizerUnavailable
}
