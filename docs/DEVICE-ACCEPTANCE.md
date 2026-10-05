# Device acceptance checklist

Run this on a real Android phone and a real iPhone from the exact EAS preview or production build. Use disposable accounts and test images only. Record the build ID and result for each device.

## Account and session

- Create an account with an 8+ character password containing uppercase, lowercase, and a number; verify email if confirmations are enabled.
- Check invalid password throttling, CAPTCHA failure/cancellation, password recovery, sign out, relaunch, and session expiry.
- Verify Google sign-in on Android/iOS and Apple sign-in on iOS only after their provider configurations are live. Check cancellation and a returning account.

## Collecting and media

- Create an item from a new account using General, a new collection, and an inline new category.
- Verify item acquired date defaults to today and can be changed or cleared without changing a collection date.
- Upload a valid image, retry after disabling network, and ensure an unsupported image/video/PDF produces an images-only message.
- Test edit/delete item and collection. Confirm a second account cannot read a private item or signed image URL.
- Check upload/count/storage limits using controlled test settings only; restore production limits afterwards.

## Explore and public safety

- Signed out: Browse Explore entries and collection topics, open an entry directly, use the collection button, and report/block content.
- Signed in: Confirm a new public choice appears in Explore. With five distinct test accounts, report an entry and verify it disappears from Explore/share visibility, then restore/remove it through the administrator queue. Change title/photo/visibility and verify public visibility remains correctly scoped.
- Report content from a guest and signed-in account. Block/unblock a collector and confirm the Explore list refreshes without exposing identity details.

## Platform behavior

- Switch light/dark/system themes. Check safe areas, keyboard, image picking, back navigation, orientation restriction, small screens, and tablet layouts if tablets remain supported.
- Inspect Android permissions in Settings: photo/camera access only when requested; no microphone or broad storage permission.
- Open privacy, terms, community, support, and delete-account pages from a signed-out browser and from the app.
- Delete the disposable account. Confirm it freezes immediately, its photos are no longer retrievable, and maintenance resolves any deliberate R2 outage retry.

Do not sign off based solely on an Expo Go or web preview. Attach screenshots/log references without tokens, email addresses, photo URLs, or credentials.
