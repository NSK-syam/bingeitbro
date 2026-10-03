import Foundation
import UIKit
import Capacitor
import AuthenticationServices
import CryptoKit
import WidgetKit

/// Local Capacitor plugin (jsName "BibNative") for features that need native iOS APIs:
/// - Sign in with Apple (ASAuthorizationController)
/// - Home screen widget data (App Group defaults + WidgetCenter)
///
/// Registered in MainViewController.capacitorDidLoad().
@objc(BibNativePlugin)
public class BibNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BibNativePlugin"
    public let jsName = "BibNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signInWithApple", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setWidgetData", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearWidgetData", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ensureWidgetOwner", returnType: CAPPluginReturnPromise),
    ]

    // MARK: - Shared widget constants (must match BibWidget.swift)

    static let appGroupId = "group.com.bingeitbro.app"
    static let widgetDataKey = "widgetData"
    static let widgetOwnerKey = "widgetDataOwner"
    static let widgetExpectedOwnerKey = "widgetExpectedOwner"
    static let widgetGenerationKey = "widgetGeneration"
    static let posterDirName = "widget-posters"
    static let widgetKind = "BibWidget"

    // MARK: - Sign in with Apple

    /// Retained until the authorization completes (success, error or cancel).
    private var appleSignInCall: CAPPluginCall?
    private var appleSignInController: ASAuthorizationController?

    @objc func signInWithApple(_ call: CAPPluginCall) {
        guard let rawNonce = call.getString("nonce"), !rawNonce.isEmpty else {
            call.reject("A nonce is required.", "INVALID_ARGUMENT")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            // One request at a time: each nonce is bound to exactly one authorization.
            if self.appleSignInCall != nil {
                call.reject("Sign in with Apple is already in progress.", "IN_PROGRESS")
                return
            }

            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            // Apple gets the SHA-256 of the raw nonce; Supabase later receives the raw nonce
            // and verifies that its hash matches the nonce claim in the identity token.
            request.nonce = Self.sha256Hex(rawNonce)

            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self

            self.appleSignInCall = call
            self.appleSignInController = controller
            controller.performRequests()
        }
    }

    private func finishAppleSignIn() -> CAPPluginCall? {
        let call = appleSignInCall
        appleSignInCall = nil
        appleSignInController?.delegate = nil
        appleSignInController?.presentationContextProvider = nil
        appleSignInController = nil
        return call
    }

    static func sha256Hex(_ input: String) -> String {
        let digest = SHA256.hash(data: Data(input.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    // MARK: - Widget data

    /// Serializes widget state (owner gate, defaults and poster files).
    private static let widgetQueue = DispatchQueue(label: "com.bingeitbro.app.widget-data")

    private static var posterDirectory: URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupId)?
            .appendingPathComponent(posterDirName, isDirectory: true)
    }

    /// Owner key stored with the snapshot: SHA-256 of the user id (no raw ids in shared storage).
    private static func ownerKey(for userId: String) -> String {
        sha256Hex("bib-widget-owner:" + userId)
    }

    /// Loads the owner gate from App Group defaults (persisted so it survives WebView reloads
    /// and app restarts). Must be called on widgetQueue.
    private static func loadGate(_ defaults: UserDefaults?) -> WidgetOwnerGate {
        let stored = defaults?.object(forKey: widgetGenerationKey) as? NSNumber
        return WidgetOwnerGate(
            generation: stored?.uint64Value ?? 0,
            expectedOwner: defaults?.string(forKey: widgetExpectedOwnerKey)
        )
    }

    /// Must be called on widgetQueue.
    private static func saveGate(_ gate: WidgetOwnerGate, _ defaults: UserDefaults?) {
        defaults?.set(NSNumber(value: gate.generation), forKey: widgetGenerationKey)
        if let owner = gate.expectedOwner {
            defaults?.set(owner, forKey: widgetExpectedOwnerKey)
        } else {
            defaults?.removeObject(forKey: widgetExpectedOwnerKey)
        }
    }

    /// Must be called on widgetQueue.
    private static func applySnapshotEffect(_ effect: WidgetOwnerGate.Effect, _ defaults: UserDefaults?) {
        guard effect == .clearSnapshot else { return }
        clearStoredWidgetData(defaults)
        DispatchQueue.main.async { WidgetCenter.shared.reloadAllTimelines() }
    }

    /// Must be called on widgetQueue.
    private static func clearStoredWidgetData(_ defaults: UserDefaults?) {
        defaults?.removeObject(forKey: widgetDataKey)
        defaults?.removeObject(forKey: widgetOwnerKey)
        if let dir = posterDirectory {
            removePosters(in: dir, except: [])
        }
    }

    private static func snapshotState(_ defaults: UserDefaults?) -> (committedOwner: String?, hasSnapshot: Bool) {
        (defaults?.string(forKey: widgetOwnerKey), defaults?.object(forKey: widgetDataKey) != nil)
    }

    /// { ownerId } -> reserves the widget for this user before fetching. Any owner transition
    /// bumps the generation (even if nothing was committed yet), so an older pending write can
    /// never commit; another (or unknown) owner's snapshot is cleared, the same owner's is kept.
    @objc func ensureWidgetOwner(_ call: CAPPluginCall) {
        guard let ownerId = call.getString("ownerId"), !ownerId.isEmpty else {
            call.reject("ownerId is required.", "INVALID_ARGUMENT")
            return
        }
        let owner = Self.ownerKey(for: ownerId)
        let cleared: Bool = Self.widgetQueue.sync {
            let defaults = UserDefaults(suiteName: Self.appGroupId)
            var gate = Self.loadGate(defaults)
            let state = Self.snapshotState(defaults)
            let effect = gate.ensure(owner: owner, committedOwner: state.committedOwner, hasSnapshot: state.hasSnapshot)
            Self.saveGate(gate, defaults)
            Self.applySnapshotEffect(effect, defaults)
            return effect == .clearSnapshot
        }
        call.resolve(["cleared": cleared])
    }

    /// Payload: { ownerId, items: [{ title, year, sender, posterUrl, path }], unwatchedCount }
    /// Stores a minimal snapshot (no tokens or ids) in App Group defaults, downloads
    /// small posters into the App Group container, then reloads widget timelines.
    @objc func setWidgetData(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: Self.appGroupId) else {
            call.reject("App Group is not available.", "UNAVAILABLE")
            return
        }
        guard let ownerId = call.getString("ownerId"), !ownerId.isEmpty else {
            call.reject("ownerId is required.", "INVALID_ARGUMENT")
            return
        }
        let owner = Self.ownerKey(for: ownerId)

        let rawItems = (call.getArray("items") ?? []).compactMap { $0 as? JSObject }.prefix(3)
        let unwatchedCount = max(0, call.getInt("unwatchedCount") ?? 0)

        struct PendingItem {
            let title: String
            let year: Int?
            let sender: String
            let path: String
            let posterUrl: URL?
        }

        let pending: [PendingItem] = rawItems.map { item in
            let title = String((item["title"] as? String ?? "").prefix(120))
            var year: Int?
            if let y = item["year"] as? Int, y > 0 { year = y }
            else if let y = item["year"] as? Double, y > 0 { year = Int(y) }
            else if let s = item["year"] as? String, let y = Int(s), y > 0 { year = y }
            let sender = String((item["sender"] as? String ?? "").prefix(60))
            var path = item["path"] as? String ?? "/"
            if !path.hasPrefix("/") || path.hasPrefix("//") { path = "/" }
            var posterUrl: URL?
            if let s = item["posterUrl"] as? String, let url = URL(string: s), url.scheme == "https" {
                posterUrl = url
            }
            return PendingItem(title: title, year: year, sender: sender, path: String(path.prefix(300)), posterUrl: posterUrl)
        }

        // Reserve the owner and take a write token synchronously, before any async work.
        let token: WidgetOwnerGate.WriteToken = Self.widgetQueue.sync {
            var gate = Self.loadGate(defaults)
            let state = Self.snapshotState(defaults)
            let (token, effect) = gate.beginWrite(owner: owner, committedOwner: state.committedOwner, hasSnapshot: state.hasSnapshot)
            Self.saveGate(gate, defaults)
            Self.applySnapshotEffect(effect, defaults)
            return token
        }

        let posterDir = Self.posterDirectory
        if let dir = posterDir {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }

        var posterFiles = [String?](repeating: nil, count: pending.count)
        let group = DispatchGroup()
        let lock = NSLock()

        if let dir = posterDir {
            for (index, item) in pending.enumerated() {
                guard let url = item.posterUrl else { continue }
                group.enter()
                var request = URLRequest(url: url)
                request.timeoutInterval = 15
                URLSession.shared.dataTask(with: request) { data, response, _ in
                    defer { group.leave() }
                    guard let data = data, !data.isEmpty, data.count < 2_000_000,
                          let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                          UIImage(data: data) != nil else { return }
                    // Generation in the name: files of a stale write are never referenced.
                    let name = "poster-g\(token.generation)-\(index).jpg"
                    do {
                        try data.write(to: dir.appendingPathComponent(name), options: .atomic)
                        lock.lock()
                        posterFiles[index] = name
                        lock.unlock()
                    } catch {
                        // Widget falls back to a placeholder.
                    }
                }.resume()
            }
        }

        group.notify(queue: Self.widgetQueue) {
            // Re-read the persisted gate: a clear/ensure/set from any page load since this
            // write began changes the generation and/or the expected owner.
            let gate = Self.loadGate(defaults)
            guard gate.canCommit(token) else {
                if let dir = posterDir {
                    for file in posterFiles.compactMap({ $0 }) {
                        try? FileManager.default.removeItem(at: dir.appendingPathComponent(file))
                    }
                }
                call.resolve(["ok": false, "stale": true])
                return
            }

            let items: [[String: Any]] = pending.enumerated().map { index, item in
                var dict: [String: Any] = [
                    "title": item.title,
                    "sender": item.sender,
                    "path": item.path,
                ]
                if let year = item.year { dict["year"] = year }
                if let file = posterFiles[index] { dict["posterFile"] = file }
                return dict
            }
            let snapshot: [String: Any] = [
                "items": items,
                "unwatchedCount": unwatchedCount,
                "updatedAt": Date().timeIntervalSince1970,
            ]

            guard let json = try? JSONSerialization.data(withJSONObject: snapshot) else {
                call.reject("Unable to encode widget data.", "ENCODE_FAILED")
                return
            }
            defaults.set(json, forKey: Self.widgetDataKey)
            defaults.set(token.owner, forKey: Self.widgetOwnerKey)

            if let dir = posterDir {
                Self.removePosters(in: dir, except: Set(posterFiles.compactMap { $0 }))
            }

            DispatchQueue.main.async { WidgetCenter.shared.reloadAllTimelines() }
            call.resolve(["ok": true])
        }
    }

    /// Sign-out / explicit clear. Synchronously (before resolving) marks the widget as
    /// signed out and bumps the generation, so no pending write can commit afterwards,
    /// then removes the snapshot and posters.
    @objc func clearWidgetData(_ call: CAPPluginCall) {
        Self.widgetQueue.sync {
            let defaults = UserDefaults(suiteName: Self.appGroupId)
            var gate = Self.loadGate(defaults)
            gate.clear()
            Self.saveGate(gate, defaults)
            defaults?.synchronize()
            Self.clearStoredWidgetData(defaults)
        }
        DispatchQueue.main.async { WidgetCenter.shared.reloadAllTimelines() }
        call.resolve(["ok": true])
    }

    private static func removePosters(in dir: URL, except keep: Set<String>) {
        guard let files = try? FileManager.default.contentsOfDirectory(atPath: dir.path) else { return }
        for file in files where !keep.contains(file) {
            try? FileManager.default.removeItem(at: dir.appendingPathComponent(file))
        }
    }
}

// MARK: - ASAuthorizationControllerDelegate

extension BibNativePlugin: ASAuthorizationControllerDelegate {
    public func authorizationController(controller: ASAuthorizationController,
                                        didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = finishAppleSignIn() else { return }

        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            call.reject("Apple did not return an identity token.", "NO_TOKEN")
            return
        }

        var result: JSObject = ["identityToken": identityToken]
        if let codeData = credential.authorizationCode, let code = String(data: codeData, encoding: .utf8) {
            result["authorizationCode"] = code
        }
        // Apple only returns name and email on the first authorization for this app.
        if let given = credential.fullName?.givenName, !given.isEmpty { result["givenName"] = given }
        if let family = credential.fullName?.familyName, !family.isEmpty { result["familyName"] = family }
        if let email = credential.email, !email.isEmpty { result["email"] = email }
        call.resolve(result)
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = finishAppleSignIn() else { return }
        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            call.reject("Sign in with Apple was canceled.", "CANCELED")
            return
        }
        call.reject(error.localizedDescription, "APPLE_SIGN_IN_FAILED", error)
    }
}

// MARK: - ASAuthorizationControllerPresentationContextProviding

extension BibNativePlugin: ASAuthorizationControllerPresentationContextProviding {
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if let window = bridge?.webView?.window {
            return window
        }
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let activeScene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        if let scene = activeScene {
            if let key = scene.windows.first(where: { $0.isKeyWindow }) ?? scene.windows.first {
                return key
            }
            return UIWindow(windowScene: scene)
        }
        return ASPresentationAnchor()
    }
}
