import Foundation

/// Pure state machine that scopes home-screen widget writes to one account.
/// No UIKit/WidgetKit/IO, so it can be tested standalone:
///   scripts/mobile/test-widget-owner-gate.sh
///
/// - `expectedOwner` is the account the widget is currently reserved for. It is set as
///   soon as an ensure/set begins (and persisted by the caller), not only on commit.
/// - `generation` is bumped on every owner transition (even if nothing was committed yet),
///   on every set (a newer write supersedes an older one) and on every clear.
/// - A pending write may commit only if BOTH its generation and its owner still match.
struct WidgetOwnerGate: Equatable {
    struct WriteToken: Equatable {
        let generation: UInt64
        let owner: String
    }

    enum Effect: Equatable {
        /// Nothing to do with the stored snapshot.
        case keepSnapshot
        /// Remove the committed snapshot (and posters): it belongs to someone else or nobody known.
        case clearSnapshot
    }

    /// Expected owner after sign-out (never equal to a real owner key, which is hex).
    static let signedOutOwner = "__signed_out__"

    private(set) var generation: UInt64
    private(set) var expectedOwner: String?

    init(generation: UInt64 = 0, expectedOwner: String? = nil) {
        self.generation = generation
        self.expectedOwner = expectedOwner
    }

    /// Reserve the widget for `owner`. `committedOwner` is the owner stored with the current
    /// snapshot (nil if unknown), `hasSnapshot` whether a snapshot exists.
    mutating func ensure(owner: String, committedOwner: String?, hasSnapshot: Bool) -> Effect {
        if expectedOwner != owner {
            generation &+= 1
            expectedOwner = owner
        }
        return Self.snapshotEffect(owner: owner, committedOwner: committedOwner, hasSnapshot: hasSnapshot)
    }

    /// Begin a write for `owner`: reserves the owner (bumping on transition), then bumps the
    /// generation for this write so any older in-flight write becomes stale.
    mutating func beginWrite(owner: String, committedOwner: String?, hasSnapshot: Bool) -> (WriteToken, Effect) {
        let effect = ensure(owner: owner, committedOwner: committedOwner, hasSnapshot: hasSnapshot)
        generation &+= 1
        return (WriteToken(generation: generation, owner: owner), effect)
    }

    /// Sign-out / explicit clear: reserve the signed-out sentinel; all in-flight writes become stale.
    mutating func clear() {
        generation &+= 1
        expectedOwner = Self.signedOutOwner
    }

    func canCommit(_ token: WriteToken) -> Bool {
        token.owner != Self.signedOutOwner && token.generation == generation && token.owner == expectedOwner
    }

    /// Whether the widget may display a snapshot committed for `committedOwner`.
    /// A snapshot is shown only when it belongs to the reserved owner (or no reservation exists yet,
    /// i.e. data written by a build that predates the gate).
    static func mayDisplay(expectedOwner: String?, committedOwner: String?) -> Bool {
        guard let expected = expectedOwner else { return true }
        return expected != signedOutOwner && expected == committedOwner
    }

    /// Same-account snapshots are kept (e.g. across transient fetch errors); a snapshot of a
    /// different or unknown owner is cleared.
    static func snapshotEffect(owner: String, committedOwner: String?, hasSnapshot: Bool) -> Effect {
        if committedOwner == owner { return .keepSnapshot }
        if committedOwner == nil && !hasSnapshot { return .keepSnapshot }
        return .clearSnapshot
    }
}
