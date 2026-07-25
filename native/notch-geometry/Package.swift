// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "murmur-notch-geometry",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "murmur-notch-geometry",
            path: "Sources/murmur-notch-geometry"
        )
    ]
)
