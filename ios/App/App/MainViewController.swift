import UIKit
import Capacitor

/// Root bridge view controller. Registers plugins that live in the app target
/// itself (local plugins are not discovered automatically by Capacitor).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(BibNativePlugin())
    }
}
