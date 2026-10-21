# Deploy Form from GitHub to Netlify

Repository: [cahyoade/gymTracker](https://github.com/cahyoade/gymTracker).

The app runs as static files. Node is used on Netlify to run tests and copy the public app into `dist/`; visitors do not need Node or an account. No database server, build dependencies, environment variables or client secrets are required.

## Connect the repository once

1. Sign in to [Netlify](https://app.netlify.com/). Choose **Add new project → Import an existing project** (some accounts label this **Add new site**).
2. Choose **GitHub**. Authorize the Netlify GitHub integration for **only this repository** when selecting repository access, then choose **cahyoade/gymTracker**.
3. Select the production branch **main**. Leave the base directory empty. The committed `netlify.toml` supplies:

   | Setting | Value |
   | --- | --- |
   | Build command | `npm test && npm run build` |
   | Publish directory | `dist` |
   | Node version | `24` |

4. Choose a project name and deploy. No Functions directory or framework preset is needed. Hash routes such as `/#history` do not need a redirect rule.
5. Wait for the production deploy to show **Published**, then open its HTTPS URL. Keep a stable project URL (or custom domain) before moving your records.

Netlify builds future commits pushed to `main` automatically. A failed test or build prevents that deploy from replacing the published version. GitHub Actions is not required. See [Netlify's build configuration guide](https://docs.netlify.com/build/configure-builds/overview/) and [file-based configuration](https://docs.netlify.com/build/configure-builds/file-based-configuration/).

## Enable Google backup on the hosted origin

1. Open your existing Web OAuth client in [Google Cloud Console](https://console.cloud.google.com/auth/clients).
2. Add the exact production origin under **Authorized JavaScript origins**, for example `https://your-project.netlify.app`. Include no trailing slash, route or `#settings`. Keep the existing client ID in `js/config.js` so the same app can access your existing Drive backups.
3. Keep your account in **Audience → Test users** if the consent screen is in Testing. No redirect URI or secret is needed for this popup integration. Details: [GOOGLE_SETUP.md](GOOGLE_SETUP.md).
4. Test **Settings → Sign in with Google → Enable Drive backup** on the deployed app. Google configuration changes may take time to propagate. Offline tracking and file backups work independently.

Deploy Preview URLs have separate storage and are separate OAuth origins. Use the stable production URL for real training; registering every preview URL is unnecessary.

## Move your existing records

Browser storage belongs to an exact origin. The deployed app initially has its own empty dataset; deploying does not upload the records from localhost.

1. On your current local app, choose **Settings → Export backup** and keep the JSON file.
2. Open the final Netlify URL, choose **Settings → Import file**, review its counts, and confirm replacement.
3. Check routines, history, body measurements and any active draft before training. Alternatively, back up to Drive locally and explicitly restore that backup on the deployed app.

Use the same URL on later visits. Changing a Netlify project name, domain or browser creates a different browser dataset; export before moving. Your normal file/Drive backups remain the portable copy.

## Check the first deployment

- Open Routines, Exercises, History, Progress and Settings. Confirm **Settings** reports the offline app is ready.
- Close the page, disconnect the device from the network, and reopen the same URL. Check routines, the exercise library and saved records.
- Install through Android Chrome's menu when available. Sign-in/Drive still requires a connection.
- After a later release, accept **Save & update** in Form; it saves any active draft before reloading. Do not clear site data to update.

## Publish a later change

Run `npm test` and `npm run build` locally, commit the source changes, then push to `main`. Do not commit `dist/`: Netlify regenerates it. For changes to app assets, bump the `CACHE` version in `sw.js` and keep its asset list complete so existing offline installs receive the update. A change only to deployment configuration does not need a worker version bump.

`netlify.toml` revalidates stable asset filenames, including the worker. The service worker retains its own offline cache and offers updates explicitly. Rolling back the host does not undo browser records or immediately replace an already-installed offline cache; release a new worker cache version for an app rollback.

The build includes only `index.html`, CSS, manifest, service worker, JavaScript modules, icons, the licensed text exercise dataset and license notices. Tests, project documents, local exports, screenshots and Git metadata are excluded from the public site.

For an isolated browser check of the actual `dist/` artifact, run `npm run test:deployment` after building (requires Playwright and Chromium/Edge as described in README). It checks offline workout logging and reopening without using your personal browser records.
