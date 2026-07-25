import AppKit
import Foundation

// Prefer the screen that actually has a notch (the built-in display) over
// whichever NSScreen happens to be "main" — with an external monitor
// connected, "main" is often the one with the menu bar on it, but that's
// not necessarily the notched one.
let notched = NSScreen.screens.first { $0.safeAreaInsets.top > 0 }
let screen = notched ?? NSScreen.main

guard let screen else {
    print(#"{"hasNotch":false,"screenWidth":0,"screenHeight":0,"notchX":0,"notchWidth":0,"notchHeight":0}"#)
    exit(0)
}

let hasNotch = screen.safeAreaInsets.top > 0
let frame = screen.frame

var notchX: CGFloat = 0
var notchWidth: CGFloat = 0
let notchHeight = screen.safeAreaInsets.top

if hasNotch, let left = screen.auxiliaryTopLeftArea, let right = screen.auxiliaryTopRightArea {
    notchX = left.width
    notchWidth = frame.width - left.width - right.width
}

let payload: [String: Any] = [
    "hasNotch": hasNotch,
    "screenWidth": frame.width,
    "screenHeight": frame.height,
    "notchX": notchX,
    "notchWidth": notchWidth,
    "notchHeight": notchHeight,
]

let data = try JSONSerialization.data(withJSONObject: payload)
FileHandle.standardOutput.write(data)
