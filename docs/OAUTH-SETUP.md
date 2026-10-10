# Google and Apple sign-in setup

The app contains the login buttons and callback handling, but they stay hidden until both providers are configured. Provider client secrets, Apple `.p8` files, signing keys, database passwords, R2 credentials, and Supabase service-role keys never belong in this repository or an `EXPO_PUBLIC_*` variable.

## Before enabling the buttons

1. Deploy the commit that contains `vercel.json`. It serves the Expo app for the web callback route.
2. Set `EXPO_PUBLIC_WEB_URL` to the one production origin without a trailing slash, currently `https://www.sharecollectibles.com`.
3. In Supabase **Authentication → URL Configuration**, set the Site URL to that HTTPS origin and add exactly these Redirect URLs:

   ```text
   https://www.sharecollectibles.com/auth/callback
   collectibles://auth/callback
   ```

   Add a separate localhost callback only for local development. Do not add broad production wildcards.
4. Leave `EXPO_PUBLIC_ENABLE_SOCIAL_LOGIN=false` until a real web sign-in and iPhone sign-in have both been checked. It is a public feature switch, so its value is not secret.

The app uses the Supabase browser OAuth/PKCE flow for Google on every platform and for Apple on web/Android. iOS uses the system Sign in with Apple control and exchanges its Apple ID token with Supabase. OAuth callback codes are accepted only from the routes above and are exchanged once.

## Configure Google

1. In Google Cloud, create a project under the publisher's ownership. Configure the consent screen branding, support/contact details, audience, and testing users before release.
2. Request only `openid`, email, and profile. Additional Google scopes can trigger a longer verification process.
3. Create an **OAuth client ID** of type **Web application**. Add the production web origin as an authorized JavaScript origin:

   ```text
   https://www.sharecollectibles.com
   ```

4. Add this authorized redirect URI. This is the provider callback, not the app callback:

   ```text
   https://hoxesktykdwuvunhqnrp.supabase.co/auth/v1/callback
   ```

5. In Supabase **Authentication → Sign In / Providers → Google**, enable Google and enter the client ID and client secret there. Do not put either value in Vercel, EAS, a mobile build, or Git.
6. Test with a disposable account. Verify success, provider cancellation, direct loading of the callback route, closing/reopening the mobile app, and an existing **confirmed** email/password user signing in with Google.

This implementation does not use the native Google SDK, so it does not require Android signing fingerprints. If the native SDK is adopted later, register the debug, upload, and Play App Signing SHA fingerprints first.

## Configure Apple

Complete this after the Apple Developer membership, permanent iOS bundle identifier, and support email/domain are available.

1. Register the permanent iOS App ID (bundle identifier) and enable **Sign in with Apple**. `app.json` already enables the matching iOS entitlement for the first EAS build.
2. Create an Apple **Services ID** for browser and Android sign-in. Configure its domains and return URL with the Supabase domain:

   ```text
   Domain: hoxesktykdwuvunhqnrp.supabase.co
   Return URL: https://hoxesktykdwuvunhqnrp.supabase.co/auth/v1/callback
   ```

3. Create a Sign in with Apple signing key. Keep the downloaded `.p8` file only in the publisher's secure password/secret manager. Apple does not let you download that same private key again.
4. In Supabase **Authentication → Sign In / Providers → Apple**, enable Apple. Enter the Apple Team ID, Key ID, private key, and Client IDs. Put the **Services ID first**, then the native iOS App ID; the browser flow needs the Services ID first, while native ID-token validation accepts either configured client ID.
5. Register the production support sender/domain with Apple's private email relay before relying on Hide My Email addresses.
6. Apple browser OAuth client secrets expire. Set a calendar reminder before the selected expiry (Apple allows at most six months) and rotate the secret in the Supabase Apple provider settings.
7. Test first sign-in, returning sign-in, cancellation, Hide My Email, app restart, web sign-in, Android sign-in, and account deletion on a real iPhone. The simulator is not enough for this test.

## Accounts and identity linking

Supabase automatically links a confirmed email/password identity and Google/Apple identity that provide the same verified email. It must never be replaced by client-side ownership changes. An Apple relay address is a distinct address and remains a distinct account unless the signed-in person explicitly links identities in a later account-connections feature.

Do not enable social login for users until provider configuration, email confirmation, CAPTCHA, and the server-side signup admission hook are live and the provider/deletion acceptance tests pass.
