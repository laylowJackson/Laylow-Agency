# Owner password

Start the Python app on Windows or through the existing Linux/SSH setup. Open
http://127.0.0.1:5000/auth/setup on that computer. Choose a password of at least
12 characters and confirm it. Do not send the password or broker keys in chat.
After setup, dashboard pages, screenshots, market data, exports, settings and API
controls require the owner session. Passwords are hashed with Werkzeug scrypt;
the plaintext password is never stored. Sessions expire after eight hours and
failed logins are limited to five attempts per fifteen minutes.

The password and session state are stored in the existing private SQLite database.
Keep backups private. There is no public registration or password reset endpoint.
Until you choose a password, the previous loopback-only app behavior remains.
The health endpoint remains available for the container health check and never
returns keys. All routes still reject non-loopback Host headers. This release
does not expose your app to the internet or change execution modes.

GitHub Pages cannot store broker keys behind this login: it serves static files
and cannot run the Python backend. The public URL remains a separate viewer.
Public access needs a deployed private backend, HTTPS, authenticated routing,
Secure cookies, explicit origin handling and secure secret storage. Do not remove
the loopback restriction or upload .env files/database to make it public.
