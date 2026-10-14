# Private Laylow Agency on your iPhone + PC

This is the **private Python dashboard**, not public GitHub Pages. The computer hosts the app; Tailscale Serve makes the local app available *only* to devices allowed into the same private Tailscale network (tailnet). Tailscale access is additional to the existing owner-password login.

## Start on your iPhone

1. Install **Tailscale** from the iOS App Store: https://tailscale.com/download/ios
2. Open Tailscale, choose **Get Started / Log in**, allow the VPN configuration, and turn Tailscale **On**.
3. Sign in using the same account you will use on your Windows PC.

This alone does not connect Laylow; the PC must be configured below.

## On your Windows PC

1. Install Tailscale: https://tailscale.com/download/windows and log in to the same tailnet account as your phone. Don't share the PC with other tailnet users unless you intend to grant them access.
2. Update/install the Laylow Agency **Codex development branch** that includes `private_access.py`, this guide, and the updated `dashboard.py`. This change is on branch `codex/atlas-gpt-chat` pending review; the GitHub Pages site and local PC do not update merely because the branch exists.
3. Keep the dashboard bound to localhost; do **not** change `LAYLOW_DASHBOARD_HOST` to `0.0.0.0`.
4. Run Laylow with `START_WINDOWS.bat`. Confirm `http://127.0.0.1:5000` works in a PC browser.
5. Open Windows Terminal / PowerShell and run:

   ```powershell
   tailscale serve --bg 5000
   tailscale serve status
   ```

   Tailscale may ask you to enable HTTPS certificates. It prints a **private HTTPS URL** resembling `https://my-pc.my-tailnet.ts.net`. **Do not use `tailscale funnel`** (which is public).
6. In Laylow's **local** `.env` file, insert the exact hostname shown by Tailscale **without `https://`**:

   ```dotenv
   LAYLOW_DASHBOARD_HOST=127.0.0.1
   LAYLOW_DASHBOARD_PORT=5000
   LAYLOW_TAILSCALE_HOSTNAME=my-pc.my-tailnet.ts.net
   ```

   Replace the example hostname with your own! Never commit your private `.env`.
7. Restart the Python dashboard to load the new hostname. Run `tailscale serve status` again to confirm the address.

## Open it on your phone

1. Connect Tailscale on your iPhone, then open **Safari**.
2. Enter the exact **HTTPS** address printed by Tailscale. It should open Laylow Agency's login screen; first-time owners can visit `/auth/setup` to choose a password (at least 12 characters).
3. Sign in, open the trading city, then open **ATLAS** to use its private GPT chat if you've separately configured `OPENAI_API_KEY` and `LAYLOW_MANAGER_AI=true`.
4. In Safari's Share menu select **Add to Home Screen** for a convenient icon. The Tailscale connection and the PC must stay on.

## Security checklist

- Use **Serve**, never **Funnel**. The server code additionally requires Tailscale Serve's `Tailscale-User-Login` identity header, which is not added to public Funnel requests. Tagged-device requests do not have this user header and will be denied.
- Restrict tailnet memberships/access rules to your own phone and PC if you have other users/devices. Tailscale authentication by itself does not guarantee only these two devices have access.
- Keep **the PC running**. Closing Safari is fine; powering off the PC stops phone access.
- Keep both the **OpenAI key and Alpaca credentials** on the private PC backend only. Never put them in GitHub Pages, HTML or JS.
- Leave **LIVE trading locked**. This feature changes only access to the existing dashboard and read-only AI tools.
- The original `https://laylowjackson.github.io/Laylow-Agency/` remains **public** until you disable GitHub Pages in repo **Settings > Pages**. Do this once the private version has been tested.
- Secure browser access depends on a valid Tailscale HTTPS certificate. No HTTP tailnet access is enabled by this code.
- If the dashboard shows `local_or_private_tailnet_required`, check the exact hostname and the Serve/identity settings. Do not widen the bind address as a workaround.
- Never share owner passwords, API keys, Tailscale auth keys, or private credentials in chat.

## Validation

Unit tests are supplied in `tests/test_private_phone_access.py`. They cover exact hostname, HTTPS forwarding, Serve identity, rejecting non-loopback peers, owner signup over the forwarded HTTPS origin and a mismatched-origin denial.

```powershell
python -m unittest tests.test_private_phone_access -v
python -m unittest discover -s tests -v
```

These tests don't replace an actual Tailscale Serve/iPhone connectivity test; this branch has not been deployed to the user's PC and has not been verified on their devices.
