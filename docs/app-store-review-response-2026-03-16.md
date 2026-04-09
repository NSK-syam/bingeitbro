# App Store Review Response - March 16, 2026

Submission ID: d85c0ecf-ff30-44bb-8c40-18fc478890c9

## Reply To App Review

Hello App Review,

We updated the iOS app to address both issues raised in Guideline 4.8 and Guideline 5.1.1(v).

For login, the app now presents Sign in with Apple as an equivalent sign-in option alongside our other account sign-in methods in the iOS app, including on iPad. Sign in with Apple limits account setup to the user's name and email address, supports Apple's private email relay, and does not use app interactions for advertising purposes without consent.

For account deletion, signed-in users can delete their account directly inside the app. Open the account menu in the top-right area of the app, choose Delete Account & Data, and the app opens the in-app account deletion flow. Users can then confirm deletion from the profile deletion screen.

We also added a direct support-page path for signed-in users to reach the same in-app deletion flow.

Please review the latest build for these changes.

Thank you.

## App Review Information

Use this in the App Review Information field in App Store Connect:

- Sign in with Apple is available on the main sign-in screen in the iOS app.
- Account deletion path: sign in, open the account menu, tap Delete Account & Data, then confirm deletion in the in-app delete account flow.
- Support page also includes a direct signed-in link to the same deletion flow.

## Internal Notes

- Web/native shell fix deployed in code: Apple sign-in availability now waits for native-shell readiness on iOS/iPadOS.
- Account deletion endpoint already exists at `/api/account/delete`.
- A new iOS binary is required because the current native shell does not receive these changes via OTA updates.
