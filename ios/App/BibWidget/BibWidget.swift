import WidgetKit
import SwiftUI
import UIKit

// MARK: - Shared constants (must match App/BibNativePlugin.swift)

private enum BibShared {
    static let appGroupId = "group.com.bingeitbro.app"
    static let widgetDataKey = "widgetData"
    static let widgetOwnerKey = "widgetDataOwner"
    static let widgetExpectedOwnerKey = "widgetExpectedOwner"
    static let signedOutOwner = "__signed_out__"
    static let posterDirName = "widget-posters"
    static let widgetKind = "BibWidget"
}

private enum BibColors {
    static let background = Color(red: 10 / 255, green: 10 / 255, blue: 12 / 255)   // #0A0A0C
    static let accent = Color(red: 245 / 255, green: 158 / 255, blue: 11 / 255)      // #F59E0B
    static let card = Color.white.opacity(0.08)
    static let secondary = Color.white.opacity(0.6)
}

// MARK: - Model

struct BibWidgetItem: Decodable, Hashable {
    let title: String
    let year: Int?
    let sender: String
    let path: String
    let posterFile: String?
}

struct BibWidgetSnapshot: Decodable {
    let items: [BibWidgetItem]
    let unwatchedCount: Int
    let updatedAt: Double?

    static let empty = BibWidgetSnapshot(items: [], unwatchedCount: 0, updatedAt: nil)

    static let preview = BibWidgetSnapshot(
        items: [
            BibWidgetItem(title: "Interstellar", year: 2014, sender: "Rahul", path: "/", posterFile: nil),
            BibWidgetItem(title: "RRR", year: 2022, sender: "Priya", path: "/", posterFile: nil),
            BibWidgetItem(title: "Dark", year: 2017, sender: "Sam", path: "/", posterFile: nil),
        ],
        unwatchedCount: 3,
        updatedAt: nil
    )

    static func load() -> BibWidgetSnapshot {
        guard let defaults = UserDefaults(suiteName: BibShared.appGroupId) else { return .empty }
        // Never show a snapshot that isn't for the currently reserved account (e.g. the app
        // marked the widget signed out, or another account is being synced).
        if let expected = defaults.string(forKey: BibShared.widgetExpectedOwnerKey),
           expected == BibShared.signedOutOwner || expected != defaults.string(forKey: BibShared.widgetOwnerKey) {
            return .empty
        }
        guard let data = defaults.data(forKey: BibShared.widgetDataKey),
              let snapshot = try? JSONDecoder().decode(BibWidgetSnapshot.self, from: data) else {
            return .empty
        }
        return snapshot
    }
}

/// com.bingeitbro.app://open?path=/movie/tmdb-123
func bibOpenURL(path: String) -> URL {
    var components = URLComponents()
    components.scheme = "com.bingeitbro.app"
    components.host = "open"
    components.queryItems = [URLQueryItem(name: "path", value: path.hasPrefix("/") ? path : "/")]
    return components.url ?? URL(string: "com.bingeitbro.app://open?path=%2F")!
}

func bibPosterImage(_ file: String?) -> UIImage? {
    guard let file = file, !file.isEmpty, !file.contains("/"),
          let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: BibShared.appGroupId) else {
        return nil
    }
    let url = container.appendingPathComponent(BibShared.posterDirName, isDirectory: true).appendingPathComponent(file)
    return UIImage(contentsOfFile: url.path)
}

// MARK: - Timeline

struct BibEntry: TimelineEntry {
    let date: Date
    let snapshot: BibWidgetSnapshot
}

struct BibProvider: TimelineProvider {
    func placeholder(in context: Context) -> BibEntry {
        BibEntry(date: Date(), snapshot: .preview)
    }

    func getSnapshot(in context: Context, completion: @escaping (BibEntry) -> Void) {
        let snapshot = BibWidgetSnapshot.load()
        if context.isPreview && snapshot.items.isEmpty {
            completion(BibEntry(date: Date(), snapshot: .preview))
        } else {
            completion(BibEntry(date: Date(), snapshot: snapshot))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BibEntry>) -> Void) {
        // The app pushes new data and calls reloadAllTimelines(); the periodic
        // refresh only re-reads the shared snapshot (no network in the widget).
        let entry = BibEntry(date: Date(), snapshot: BibWidgetSnapshot.load())
        let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date().addingTimeInterval(3600)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - Views

private struct PosterView: View {
    let file: String?
    let width: CGFloat
    let height: CGFloat

    var body: some View {
        Group {
            if let image = bibPosterImage(file) {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                ZStack {
                    BibColors.card
                    Image(systemName: "film")
                        .font(.system(size: min(width, height) * 0.35))
                        .foregroundColor(BibColors.accent.opacity(0.8))
                }
            }
        }
        .frame(width: width, height: height)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
}

private struct HeaderView: View {
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "popcorn.fill")
                .font(.system(size: 11, weight: .bold))
            Text("BingeItBro")
                .font(.system(size: 12, weight: .heavy, design: .rounded))
        }
        .foregroundColor(BibColors.accent)
    }
}

private struct UnwatchedView: View {
    let count: Int

    var body: some View {
        Text(count == 1 ? "1 unwatched pick" : "\(count) unwatched picks")
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(count > 0 ? BibColors.accent : BibColors.secondary)
            .lineLimit(1)
    }
}

private struct EmptyStateView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HeaderView()
            Spacer(minLength: 0)
            Text("No picks yet — ask a friend")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.white)
                .lineLimit(3)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

private func titleLine(_ item: BibWidgetItem) -> String {
    if let year = item.year { return "\(item.title) (\(year))" }
    return item.title
}

private func senderLine(_ item: BibWidgetItem) -> String {
    item.sender.isEmpty ? "from a friend" : "from \(item.sender)"
}

struct BibSmallView: View {
    let snapshot: BibWidgetSnapshot

    var body: some View {
        if let item = snapshot.items.first {
            VStack(alignment: .leading, spacing: 4) {
                HeaderView()
                HStack(alignment: .top, spacing: 8) {
                    PosterView(file: item.posterFile, width: 44, height: 66)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.title)
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(.white)
                            .lineLimit(3)
                        if let year = item.year {
                            Text(String(year))
                                .font(.system(size: 11))
                                .foregroundColor(BibColors.secondary)
                        }
                    }
                }
                Spacer(minLength: 0)
                Text(senderLine(item))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(BibColors.secondary)
                    .lineLimit(1)
                UnwatchedView(count: snapshot.unwatchedCount)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .widgetURL(bibOpenURL(path: item.path))
        } else {
            EmptyStateView()
                .widgetURL(bibOpenURL(path: "/"))
        }
    }
}

struct BibMediumView: View {
    let snapshot: BibWidgetSnapshot

    var body: some View {
        if snapshot.items.isEmpty {
            EmptyStateView()
                .widgetURL(bibOpenURL(path: "/"))
        } else {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    HeaderView()
                    Spacer()
                    UnwatchedView(count: snapshot.unwatchedCount)
                }
                HStack(alignment: .top, spacing: 10) {
                    ForEach(Array(snapshot.items.prefix(3).enumerated()), id: \.offset) { _, item in
                        Link(destination: bibOpenURL(path: item.path)) {
                            HStack(alignment: .top, spacing: 6) {
                                PosterView(file: item.posterFile, width: 40, height: 60)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.title)
                                        .font(.system(size: 11, weight: .bold))
                                        .foregroundColor(.white)
                                        .lineLimit(3)
                                    if let year = item.year {
                                        Text(String(year))
                                            .font(.system(size: 10))
                                            .foregroundColor(BibColors.secondary)
                                    }
                                    Text(senderLine(item))
                                        .font(.system(size: 10, weight: .medium))
                                        .foregroundColor(BibColors.accent)
                                        .lineLimit(1)
                                }
                                Spacer(minLength: 0)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .widgetURL(bibOpenURL(path: snapshot.items.first?.path ?? "/"))
        }
    }
}

struct BibAccessoryRectangularView: View {
    let snapshot: BibWidgetSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("BingeItBro")
                .font(.system(size: 12, weight: .heavy))
                .widgetAccentable()
            if let item = snapshot.items.first {
                Text(titleLine(item))
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(1)
                Text(snapshot.unwatchedCount == 1 ? "1 unwatched pick" : "\(snapshot.unwatchedCount) unwatched picks")
                    .font(.system(size: 12))
                    .lineLimit(1)
            } else {
                Text("No picks yet — ask a friend")
                    .font(.system(size: 12))
                    .lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(bibOpenURL(path: snapshot.items.first?.path ?? "/"))
    }
}

struct BibWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: BibEntry

    var body: some View {
        switch family {
        case .accessoryRectangular:
            BibAccessoryRectangularView(snapshot: entry.snapshot)
                .containerBackground(for: .widget) { Color.clear }
        case .systemMedium:
            BibMediumView(snapshot: entry.snapshot)
                .containerBackground(for: .widget) { BibColors.background }
        default:
            BibSmallView(snapshot: entry.snapshot)
                .containerBackground(for: .widget) { BibColors.background }
        }
    }
}

struct BibWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: BibShared.widgetKind, provider: BibProvider()) { entry in
            BibWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Latest from friends")
        .description("The newest movie and show picks your friends sent you.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

#Preview(as: .systemMedium) {
    BibWidget()
} timeline: {
    BibEntry(date: .now, snapshot: .preview)
    BibEntry(date: .now, snapshot: .empty)
}
