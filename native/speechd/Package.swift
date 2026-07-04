// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "murmur-speechd",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "murmur-speechd",
            path: "Sources/murmur-speechd"
        )
    ]
)
