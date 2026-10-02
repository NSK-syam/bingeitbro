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
    ]

    // MARK: - Shared widget constants (must match BibWidget.swift)

    static let appGroupId = "group.com.bingeitbro.app"
    static let widgetDataKey = "widgetData"
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

    /// Payload: { items: [{ title, year, sender, posterUrl, path }], unwatchedCount }
    /// Stores a minimal snapshot (no tokens or ids) in App Group defaults, downloads
    /// small posters into the App Group container, then reloads widget timelines.
    @objc func setWidgetData(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: Self.appGroupId) else {
            call.reject("App Group is not available.", "UNAVAILABLE")
            return
        }

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

        let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupId)
        let posterDir = container?.appendingPathComponent(Self.posterDirName, isDirectory: true)
        if let dir = posterDir {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }

        var posterFiles = [String?](repeating: nil, count: pending.count)
        let group = DispatchGroup()
        let lock = NSLock()
        let stamp = Int(Date().timeIntervalSince1970)

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
                    let name = "poster-\(stamp)-\(index).jpg"
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

        group.notify(queue: .global(qos: .utility)) {
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

            // Remove posters no longer referenced.
            if let dir = posterDir {
                let keep = Set(posterFiles.compactMap { $0 })
                Self.removePosters(in: dir, except: keep)
            }

            WidgetCenter.shared.reloadAllTimelines()
            call.resolve(["ok": true])
        }
    }

    @objc func clearWidgetData(_ call: CAPPluginCall) {
        if let defaults = UserDefaults(suiteName: Self.appGroupId) {
            defaults.removeObject(forKey: Self.widgetDataKey)
        }
        if let dir = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupId)?
            .appendingPathComponent(Self.posterDirName, isDirectory: true) {
            Self.removePosters(in: dir, except: [])
        }
        WidgetCenter.shared.reloadAllTimelines()
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
