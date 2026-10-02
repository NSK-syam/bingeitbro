// Standalone tests for ios/App/App/WidgetOwnerGate.swift (no Xcode project needed).
// Run: scripts/mobile/test-widget-owner-gate.sh

import Foundation

var failures = 0
var passed = 0

func check(_ condition: Bool, _ message: String, line: Int = #line) {
    if condition {
        passed += 1
    } else {
        failures += 1
        print("FAIL (line \(line)): \(message)")
    }
}

let A = "owner-a"
let B = "owner-b"

// B4 repro: empty defaults -> A's set starts downloads -> reload / account B ->
// ensure(B) with no committed snapshot -> B's fetch fails -> A's pending write must NOT commit.
do {
    var gate = WidgetOwnerGate()
    let (tokenA, effectA) = gate.beginWrite(owner: A, committedOwner: nil, hasSnapshot: false)
    check(effectA == .keepSnapshot, "nothing to clear on first write")
    check(gate.canCommit(tokenA), "A could commit if nothing else happened")

    let effectB = gate.ensure(owner: B, committedOwner: nil, hasSnapshot: false)
    check(effectB == .keepSnapshot, "no committed snapshot to clear")
    check(gate.expectedOwner == B, "B reserved immediately")
    check(!gate.canCommit(tokenA), "A's pending write is stale after the owner transition to B")
}

// Logout while A's write is in flight: no commit afterwards; widget shows nothing.
do {
    var gate = WidgetOwnerGate()
    let (tokenA, _) = gate.beginWrite(owner: A, committedOwner: nil, hasSnapshot: false)
    gate.clear()
    check(gate.expectedOwner == WidgetOwnerGate.signedOutOwner, "signed-out sentinel reserved")
    check(!gate.canCommit(tokenA), "A's write cannot commit after sign-out")
    check(!WidgetOwnerGate.mayDisplay(expectedOwner: gate.expectedOwner, committedOwner: A),
          "a leftover A snapshot is never displayed after sign-out")
}

// Same owner A signs out and back in while an old A write is pending: old write stays stale.
do {
    var gate = WidgetOwnerGate()
    let (oldToken, _) = gate.beginWrite(owner: A, committedOwner: nil, hasSnapshot: false)
    gate.clear()
    _ = gate.ensure(owner: A, committedOwner: nil, hasSnapshot: false)
    check(!gate.canCommit(oldToken), "write from before sign-out stays stale after re-login")
    let (newToken, _) = gate.beginWrite(owner: A, committedOwner: nil, hasSnapshot: false)
    check(gate.canCommit(newToken), "fresh write for A commits")
}

// Newer write for the same owner supersedes an older one.
do {
    var gate = WidgetOwnerGate()
    let (first, _) = gate.beginWrite(owner: A, committedOwner: nil, hasSnapshot: false)
    let (second, _) = gate.beginWrite(owner: A, committedOwner: nil, hasSnapshot: false)
    check(!gate.canCommit(first), "older write is stale")
    check(gate.canCommit(second), "newest write commits")
}

// Same-account snapshot is kept across transient fetch errors (ensure again, no write).
do {
    var gate = WidgetOwnerGate()
    let effect1 = gate.ensure(owner: A, committedOwner: A, hasSnapshot: true)
    let gen = gate.generation
    let effect2 = gate.ensure(owner: A, committedOwner: A, hasSnapshot: true)
    check(effect1 == .keepSnapshot && effect2 == .keepSnapshot, "A's snapshot kept for A")
    check(gate.generation == gen, "no bump without an owner transition")
    check(WidgetOwnerGate.mayDisplay(expectedOwner: A, committedOwner: A), "A's snapshot displayed for A")
}

// Another owner's or an unknown owner's snapshot is cleared.
do {
    var gate = WidgetOwnerGate()
    check(gate.ensure(owner: B, committedOwner: A, hasSnapshot: true) == .clearSnapshot, "A's snapshot cleared for B")
    check(gate.ensure(owner: B, committedOwner: nil, hasSnapshot: true) == .clearSnapshot, "unknown-owner snapshot cleared")
    check(!WidgetOwnerGate.mayDisplay(expectedOwner: B, committedOwner: A), "A's snapshot never displayed while B is reserved")
}

// Persisted state across restarts: gate rebuilt from stored values behaves the same.
do {
    var gate = WidgetOwnerGate()
    let (tokenA, _) = gate.beginWrite(owner: A, committedOwner: nil, hasSnapshot: false)
    var restored = WidgetOwnerGate(generation: gate.generation, expectedOwner: gate.expectedOwner)
    check(restored.canCommit(tokenA), "restored gate accepts the current token")
    restored.clear()
    check(!restored.canCommit(tokenA), "restored gate rejects after clear")
}

print("WidgetOwnerGate: \(passed) passed, \(failures) failed")
exit(failures == 0 ? 0 : 1)
