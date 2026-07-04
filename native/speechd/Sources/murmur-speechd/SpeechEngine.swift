import AVFoundation
import Speech

final class SpeechEngine {
    private let audioEngine = AVAudioEngine()
    private let stopCaptureGrace: TimeInterval = 0.18
    private let stopSettleGrace: TimeInterval = 0.12
    private let stopRecognitionMaxWait: TimeInterval = 0.45
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var latestText = ""
    private var latestTextChangedAt = Date()

    func requestAuthorization(_ completion: @escaping (Bool) -> Void) {
        SFSpeechRecognizer.requestAuthorization { status in
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                completion(status == .authorized && granted)
            }
        }
    }

    func start(locale: String = "en-US") throws {
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
        latestTextChangedAt = Date()

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
            self?.request?.append(buffer)
        }

        audioEngine.prepare()
        try audioEngine.start()

        task = recognizer.recognitionTask(with: request) { [weak self] result, _ in
            guard let self, let result else { return }
            let text = result.bestTranscription.formattedString
            DispatchQueue.main.async {
                if self.latestText != text {
                    self.latestText = text
                    self.latestTextChangedAt = Date()
                }
            }
        }
    }

    func stop(_ completion: @escaping (String) -> Void) {
        guard audioEngine.isRunning else {
            stopEngineIfNeeded()
            completion(latestText)
            return
        }

        // Keep a small tail after the hotkey, then return as soon as Speech's
        // partial text settles so paste stays snappy without clipping endings.
        DispatchQueue.main.asyncAfter(deadline: .now() + stopCaptureGrace) { [weak self] in
            guard let self else {
                completion("")
                return
            }
            self.stopAudioCapture()
            self.request?.endAudio()
            self.finishWhenFinalTextSettles(startedAt: Date(), completion: completion)
        }
    }

    private func stopEngineIfNeeded() {
        stopAudioCapture()
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
    }

    private func stopAudioCapture() {
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
    }

    private func finishWhenFinalTextSettles(startedAt: Date, completion: @escaping (String) -> Void) {
        let elapsed = Date().timeIntervalSince(startedAt)
        let settledFor = Date().timeIntervalSince(latestTextChangedAt)
        if elapsed >= stopRecognitionMaxWait || settledFor >= stopSettleGrace {
            let text = latestText
            task?.cancel()
            request = nil
            task = nil
            completion(text)
            return
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
            self?.finishWhenFinalTextSettles(startedAt: startedAt, completion: completion)
        }
    }
}

enum SpeechError: Error {
    case recognizerUnavailable
}
