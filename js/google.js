import { id } from './model.js';
let libraryPromise;
let signingKeys;
let keysExpireAt = 0;

export async function loadGoogleLibrary() {
  if(globalThis.isSecureContext===false)throw new Error('Google sign-in needs HTTPS or localhost. File backups are available on this network preview.');
  if (globalThis.google?.accounts) return;
  if (!libraryPromise) {
    libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      const fail = () => {
        clearTimeout(timer); script.remove();
        reject(new Error('Google sign-in could not load. Check your connection and try again.'));
      };
      const timer = setTimeout(fail, 15000);
      script.onerror = fail;
      script.onload = () => { clearTimeout(timer); if (globalThis.google?.accounts) resolve(); else fail(); };
      document.head.append(script);
    }).catch(error => { libraryPromise = null; throw error; });
  }
  await libraryPromise;
}

const decodeBytes = value => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
const decodeJSON = value => JSON.parse(new TextDecoder().decode(decodeBytes(value)));

// Verify the credential before displaying an account. Drive still uses its own
// access token and checks Google's userinfo endpoint before permitting backup.
export async function verifyGoogleCredential(credential, clientId, nonce) {
  let parts, header, claims;
  try {
    parts = credential.split('.');
    if (parts.length !== 3) throw new Error();
    header = decodeJSON(parts[0]); claims = decodeJSON(parts[1]);
  } catch { throw new Error('Google returned an invalid sign-in response. Try again.'); }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || claims.aud !== clientId ||
      !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) ||
      !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000 || claims.nonce !== nonce ||
      typeof claims.sub !== 'string' || !claims.sub || typeof claims.email !== 'string' || !claims.email) {
    throw new Error('Google sign-in could not be verified. Try again.');
  }
  if (!signingKeys || Date.now() >= keysExpireAt || !signingKeys.some(key => key.kid === header.kid)) {
    let response;
    try { response = await fetch('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(15000) }); }
    catch { throw new Error('Could not verify Google sign-in. Check your connection and try again.'); }
    if (!response.ok) throw new Error('Could not verify Google sign-in. Try again.');
    signingKeys = (await response.json()).keys;
    if (!Array.isArray(signingKeys)) throw new Error('Google verification keys are unavailable. Try again.');
    keysExpireAt = Date.now() + 5 * 60 * 1000;
  }
  const jwk = signingKeys.find(key => key.kid === header.kid && key.kty === 'RSA' && key.alg === 'RS256');
  if (!jwk) throw new Error('Google sign-in could not be verified. Try again.');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decodeBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new Error('Google sign-in could not be verified. Try again.');
  return { id: claims.sub, email: claims.email, name: typeof claims.name === 'string' ? claims.name : claims.email };
}

export class GoogleSignIn {
  constructor(clientId, onSignIn, onError) {
    this.clientId = clientId; this.onSignIn = onSignIn; this.onError = onError;
    this.profile = null; this.ready = false; this.nonce = id(); this.generation = 0;
  }
  async prepare() {
    if (!this.clientId) throw new Error('Google sign-in is not configured for this app yet.');
    await loadGoogleLibrary();
    if (this.ready) return;
    google.accounts.id.initialize({
      client_id: this.clientId, nonce: this.nonce, ux_mode: 'popup', auto_select: false,
      callback: async response => {
        const generation = this.generation;
        try {
          const profile = await verifyGoogleCredential(response.credential, this.clientId, this.nonce);
          if (generation !== this.generation) return;
          this.profile = profile; this.onSignIn(profile);
        } catch (error) { this.onError(error); }
      }
    });
    this.ready = true;
  }
  renderButton(container) {
    if (!this.ready || !container?.isConnected) return;
    container.replaceChildren();
    google.accounts.id.renderButton(container, {
      type: 'standard', theme: document.documentElement.dataset.theme === 'dark' ? 'filled_black' : 'outline', size: 'large', text: 'signin_with',
      shape: 'rectangular', logo_alignment: 'left', width: Math.min(320, Math.floor(container.clientWidth))
    });
  }
  signOut() {
    this.generation++; this.profile = null;
    if (this.ready) google.accounts.id.disableAutoSelect();
  }
}
