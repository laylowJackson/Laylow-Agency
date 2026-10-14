# ATLAS GPT chat — safe local integration

This is an opt-in OpenAI-powered **advisory** layer for Laylow Agency. The existing stock/futures specialist bots and deterministic manager/risk controls remain unchanged. The chat cannot submit, cancel, or approve orders; it cannot unlock LIVE trading.

## What was added

- **Ask ATLAS** chat panel inside the existing Big Manager robot room.
- A team selector for **all 10 teams** or an agency-wide summary.
- An **Ask ATLAS about this team** shortcut inside team offices.
- A local, read-only Python route: `POST /api/atlas/chat`.
- A setup/status route: `GET /api/atlas/status`.
- Server-side allowlisted team context containing: worker health, signal/indicator summary, specialist votes, lockouts, manager severity, timestamps, and imported closed-trade totals when available.
- No API credentials, broker identifiers, CSRF token, or raw account data are sent to the OpenAI model.
- A five-questions-per-minute per-process limit, 500-character input limit, JSON response validation, provider timeouts, and explicit unavailable states.

## Setup

1. Run the **local Python app** via `SETUP_WINDOWS.bat` / `START_WINDOWS.bat`.
2. Open `http://127.0.0.1:5000`.
3. Create your owner password from `/auth/setup`, or sign in if already configured. The chat endpoint refuses requests until an owner password exists.
4. Create a project API key in the OpenAI Platform (API billing is separate from ChatGPT subscriptions). Keep it **private**.
5. Put this in the local `.env` file (never commit this file):
   ```dotenv
   OPENAI_API_KEY=<your-own-secret-key>
   OPENAI_MODEL=gpt-4o-mini
   LAYLOW_MANAGER_AI=true
   ```
   Choose a model actually available to your OpenAI API project; the configured name is not a promise that the same model powering this ChatGPT conversation is available to the API.
6. Restart the Python app. Open **Big Manager · ATLAS**, select a team, type a question, and press **Ask ATLAS**.

The existing optional 30-second Big Manager report summaries also use `LAYLOW_MANAGER_AI=true` in analyze/paper mode. These consume API calls; keep the switch off until you want to enable that cost.

## Important scope

The GitHub Pages URL is a **public, static** website and cannot safely store an OpenAI API key or run this Python route. The ATLAS chat shows an informative unavailable message there. To use AI from the phone or a public domain later, add a **separately authenticated HTTPS backend** first. Do not put `OPENAI_API_KEY` in HTML, JavaScript, Pages, GitHub Secrets exposed to clients, or browser localStorage.

AI can discuss what the local app has recorded; no data source is invented. If the source is simulated, stale, or has no imported closed-trade records, ATLAS should say so. Practice and broker-paper performance are distinct.

## Automated tests

```bash
python -m unittest tests.test_manager_chat -v
python -m unittest discover -s tests -v
```

Tests use a fake OpenAI client and no external API credentials. They check valid team scopes, missing/invalid question handling, privacy filtering, configuration gates and unexpected model responses.

## Deployment status

This change is prepared in a separate development branch and does not automatically deploy to GitHub Pages or make any live-money broker path available.
