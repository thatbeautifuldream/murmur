import Network
import Foundation

final class Server {
    private let port: NWEndpoint.Port
    private var listener: NWListener?
    private let engine = SpeechEngine()

    init(port: UInt16 = 8722) {
        self.port = NWEndpoint.Port(rawValue: port)!
    }

    func start() throws {
        let params = NWParameters.tcp
        listener = try NWListener(using: params, on: port)
        listener?.newConnectionHandler = { [weak self] connection in
            self?.accept(connection)
        }
        listener?.start(queue: .main)
        print("murmur-speechd listening on 127.0.0.1:\(port)")
    }

    private func accept(_ connection: NWConnection) {
        guard isLoopback(connection.endpoint) else {
            connection.cancel()
            return
        }
        connection.start(queue: .main)
        receive(connection)
    }

    private func isLoopback(_ endpoint: NWEndpoint) -> Bool {
        if case let .hostPort(host, _) = endpoint {
            switch host {
            case .ipv4(let addr): return addr == .loopback
            case .ipv6(let addr): return addr == .loopback
            case .name(let name, _): return name == "localhost"
            @unknown default: return false
            }
        }
        return false
    }

    private func receive(_ connection: NWConnection) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
            guard let self, let data, !data.isEmpty else {
                connection.cancel()
                return
            }
            self.handle(request: data, on: connection)
        }
    }

    private func handle(request: Data, on connection: NWConnection) {
        guard let text = String(data: request, encoding: .utf8),
              let requestLine = text.split(separator: "\r\n").first else {
            respond(connection, status: 400, body: ["error": "bad request"])
            return
        }
        let parts = requestLine.split(separator: " ")
        guard parts.count >= 2 else {
            respond(connection, status: 400, body: ["error": "bad request"])
            return
        }
        let method = String(parts[0])
        let path = String(parts[1])

        switch (method, path) {
        case ("GET", "/health"):
            respond(connection, status: 200, body: ["status": "ok"])
        case ("POST", _) where path.hasPrefix("/start"):
            do {
                try engine.start(locale: queryParam(path, "locale") ?? "en-US")
                respond(connection, status: 200, body: ["status": "listening"])
            } catch {
                respond(connection, status: 500, body: ["error": "\(error)"])
            }
        case ("POST", "/stop"):
            let text = engine.stop()
            respond(connection, status: 200, body: ["text": text])
        default:
            respond(connection, status: 404, body: ["error": "not found"])
        }
    }

    private func queryParam(_ path: String, _ name: String) -> String? {
        guard let query = path.split(separator: "?", maxSplits: 1).last, path.contains("?") else {
            return nil
        }
        for pair in query.split(separator: "&") {
            let parts = pair.split(separator: "=", maxSplits: 1)
            if parts.first == Substring(name) {
                return parts.count > 1 ? String(parts[1]).removingPercentEncoding : ""
            }
        }
        return nil
    }

    private func respond(_ connection: NWConnection, status: Int, body: [String: String]) {
        let json = (try? JSONSerialization.data(withJSONObject: body)) ?? Data()
        let statusLine = status == 200 ? "200 OK" : (status == 404 ? "404 Not Found" : (status == 400 ? "400 Bad Request" : "500 Internal Server Error"))
        var response = "HTTP/1.1 \(statusLine)\r\n"
        response += "Content-Type: application/json\r\n"
        response += "Content-Length: \(json.count)\r\n"
        response += "Connection: close\r\n\r\n"
        var data = Data(response.utf8)
        data.append(json)
        connection.send(content: data, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }
}
