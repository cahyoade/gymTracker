# Set up Google sign-in for Form

Do this once for the app. Afterwards, users simply press **Sign in with Google** in Settings. They never enter an OAuth client ID.

The integration is implemented and your public client ID is now configured in `js/config.js`. The steps below document the Google Cloud settings that must match this deployment. Offline workouts and JSON export/import work independently. No Firebase, application server, or client secret is needed for this browser popup flow.

## 1. Create a project and enable Drive

1. Open [Google Cloud Console](https://console.cloud.google.com/) with your Google account.
2. Use the project selector at the top to create a project, for example **Form Gym Tracker**. Select that project before continuing.
3. Open **APIs & Services → Library**, search for **Google Drive API**, open it, and press **Enable**.

The app uses Drive's private app data folder, which does not appear alongside your normal Drive files. See [Google's app data documentation](https://developers.google.com/workspace/drive/api/guides/appdata).

## 2. Set up the consent screen

Open **Google Auth Platform** from the console menu. If it is not configured, press **Get started**.

- **Branding:** use **Form** as the app name and your email for support/contact.
- **Audience:** choose **External** for a personal Gmail account. Keep the project in **Testing**, then add your own email under **Test users**. Add other accounts here if you want to test with them.
- **Data Access → Add or remove scopes:** add `openid`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/userinfo.profile`, and `https://www.googleapis.com/auth/drive.appdata`. Save.

Basic account information supports sign-in; `drive.appdata` allows private backups. Form does not request access to all your Drive files. Menu labels may vary slightly; [Google's consent setup guide](https://developers.google.com/workspace/guides/configure-oauth-consent) covers Branding, Audience, and Data Access.

## 3. Create a Web OAuth client

Go to **Google Auth Platform → Clients → Create client**.

- Application type: **Web application**.
- Name: **Form Web**.
- Under **Authorized JavaScript origins**, add these as separate entries:

```text
http://localhost
http://localhost:4173
http://localhost:4180
```

Port 4173 is the development server's default; 4180 is the preview origin used during development. Register any other port you actually use. Use `localhost` when opening the app rather than `127.0.0.1` unless you also register that origin.

For a deployed app, add its exact HTTPS origin, such as `https://your-app.example.com`. Do not include a path, a trailing slash, or `#settings`. This app uses popup callbacks in JavaScript, so leave **Authorized redirect URIs** empty. See [Google's Web client setup](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid) and [popup sign-in integration](https://developers.google.com/identity/gsi/web/guides/integrate).

Press **Create** and copy the **Client ID**, which ends in `.apps.googleusercontent.com`. Your supplied client ID is already configured in this app. Do not send the client secret, password, or access tokens.

## 4. Configure the app

If you want to do this yourself, open `js/config.js` and replace the empty string:

```js
export const GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
```

Use the actual complete client ID Google supplies, not the example above. This public identifier is part of the deployed app. Use the same client on every device/origin that should access your backups.

If an older version is already installed, increment the `CACHE` version in `sw.js` whenever you change the configuration, so the cached app receives it. This change currently uses `form-shell-v1.3.0`; a later configuration change could use `form-shell-v1.3.1`. Keep the rest of the cache name prefix unchanged.

Start the app from its folder in PowerShell:

```powershell
$env:PORT = '4180'
node scripts/serve.mjs
```

Open [Form Settings](http://localhost:4180/#settings) in Chrome. If Form offers an update, press **Save & update**, which saves an active draft before reloading. Keep using the same origin to retain the same browser dataset. Do not clear browser data to update.

## 5. Test the connection

1. In **Settings**, press **Sign in with Google** and choose an allowed test account.
2. Your name and email should appear. Press **Enable Drive backup** and approve the private backup permission using the same account.
3. Press **Back up now**. Form uploads and verifies the backup before reporting success.
4. Press **Find backups** to check that it is listed. Restore previews the backup and asks for confirmation before replacing local data; a recovery copy is kept.
5. Use **Sign out** when finished. Your local routines and history remain available.

Sign-in and Drive permission are separate steps, following [Google's authentication/authorization guidance](https://developers.google.com/identity/oauth2/web/guides/overview). Tokens and account details live only in memory, so reopening the app requires signing in again for Drive. When Drive access expires, **Enable Drive backup** reconnects it. Backups never upload automatically.

## If something goes wrong

| Problem | What to check |
| --- | --- |
| Sign-in is still disabled | Configure `js/config.js`, bump the service-worker cache version, restart the server, and accept the app update. |
| Origin/client error | Use a Web application client and register the exact scheme, hostname, and port shown in your browser. Allow time for Google's changes to propagate. |
| Account cannot authorize | Add the account under Audience → Test users while the app is in Testing. |
| Drive permission denied | Try **Enable Drive backup** again and approve the permission. Local logging continues either way. |
| Wrong Google account | Sign out, sign in with the intended account, then choose that same account for Drive consent. |
| Popup blocked or closed | Allow the sign-in popup and retry from the button. |
| Drive request fails | Check that Drive API is enabled in this client's project and that you are online. |

The public Web OAuth client ID is configured. Complete the sign-in and Drive consent steps yourself to verify access to your real account.
