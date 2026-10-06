from flask import Flask, render_template_string
import sqlite3
from datetime import datetime, timezone

app = Flask(__name__)


def get_db_connection():
    conn = sqlite3.connect('team_status.db')
    conn.row_factory = sqlite3.Row
    return conn


@app.route('/')
def index():
    conn = get_db_connection()
    teams = conn.execute(
        """
        SELECT team_name, status, last_heartbeat, active, notes
        FROM team_status
        ORDER BY team_name
        """
    ).fetchall()

    scores = conn.execute(
        """
        SELECT team_name, score, wins, losses, streak, is_disabled, cool_down_until
        FROM team_scores
        ORDER BY team_name
        """
    ).fetchall()

    conn.close()

    score_map = {row["team_name"]: row for row in scores}
    rows = []
    for team in teams:
        score_row = score_map.get(team["team_name"])
        rows.append({
            "team_name": team["team_name"],
            "status": team["status"],
            "last_heartbeat": team["last_heartbeat"],
            "active": bool(team["active"]),
            "notes": team["notes"],
            "score": score_row["score"] if score_row else 0,
            "wins": score_row["wins"] if score_row else 0,
            "losses": score_row["losses"] if score_row else 0,
            "streak": score_row["streak"] if score_row else 0,
            "is_disabled": bool(score_row["is_disabled"]) if score_row else False,
            "cool_down_until": score_row["cool_down_until"] if score_row else "N/A",
        })

    system_status = "OK" if all(row["active"] for row in rows) else "WARNING"
    if any(row["status"] == "DOWN" for row in rows):
        system_status = "DOWN"

    html = """
    <html>
      <head>
        <title>Laylow Agency Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          :root {
            --bg: #0b1220;
            --panel: #111827;
            --panel-alt: #1f2937;
            --text: #f9fafb;
            --muted: #9ca3af;
            --good: #34d399;
            --warn: #fbbf24;
            --bad: #f87171;
            --accent: #60a5fa;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: Arial, sans-serif;
            background: var(--bg);
            color: var(--text);
          }
          .container {
            max-width: 1000px;
            margin: 0 auto;
            padding: 16px;
          }
          .header {
            background: linear-gradient(135deg, #1d4ed8, #111827);
            border-radius: 12px;
            padding: 20px 16px;
            margin-bottom: 18px;
            box-shadow: 0 10px 24px rgba(0,0,0,0.2);
          }
          .title {
            margin: 0;
            font-size: clamp(1.4rem, 3vw, 2.4rem);
          }
          .status-pill {
            display: inline-block;
            margin-top: 8px;
            padding: 6px 10px;
            border-radius: 999px;
            font-size: 0.8rem;
            font-weight: bold;
            letter-spacing: 0.04em;
            text-transform: uppercase;
          }
          .status-ok { background: rgba(52, 211, 153, 0.18); color: var(--good); }
          .status-warning { background: rgba(251, 191, 36, 0.18); color: var(--warn); }
          .status-down { background: rgba(248, 113, 113, 0.18); color: var(--bad); }
          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 12px;
          }
          .card {
            background: var(--panel);
            border: 1px solid #374151;
            border-radius: 12px;
            padding: 14px;
            box-shadow: 0 8px 18px rgba(0,0,0,0.08);
          }
          .team-name {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            font-weight: bold;
          }
          .badge {
            padding: 5px 8px;
            border-radius: 999px;
            font-size: 0.72rem;
            font-weight: bold;
            text-transform: uppercase;
          }
          .good-badge { background: rgba(52, 211, 153, 0.12); color: var(--good); }
          .warn-badge { background: rgba(251, 191, 36, 0.12); color: var(--warn); }
          .bad-badge { background: rgba(248, 113, 113, 0.12); color: var(--bad); }
          .meta {
            color: var(--muted);
            font-size: 0.8rem;
            margin-top: 8px;
          }
          .stats {
            display: grid;
            grid-template-columns: repeat(2, minmax(80px, 1fr));
            gap: 8px;
            margin-top: 10px;
          }
          .stat {
            background: var(--panel-alt);
            border-radius: 8px;
            padding: 8px;
          }
          .stat-label { font-size: 0.7rem; color: var(--muted); }
          .stat-value { font-size: 1rem; font-weight: bold; margin-top: 4px; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 18px;
            background: var(--panel);
            border-radius: 12px;
            overflow: hidden;
          }
          th, td {
            border-bottom: 1px solid #374151;
            padding: 10px 12px;
            text-align: left;
          }
          th { background: #1f2937; }
          @media (max-width: 600px) {
            .container { padding: 12px; }
            .status-pill { display: block; width: fit-content; }
            th, td { padding: 8px 6px; font-size: 0.8rem; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="title">Laylow Agency</h1>
            <div class="status-pill {% if system_status == 'OK' %}status-ok{% elif system_status == 'WARNING' %}status-warning{% else %}status-down{% endif %}">
              {{ system_status }}
            </div>
          </div>

          <div class="grid">
            {% for row in rows %}
            <div class="card">
              <div class="team-name">
                <span>{{ row.team_name }}</span>
                <span class="badge {% if row.status == 'RUNNING' or row.status == 'LIVE_ELIGIBLE' %}good-badge{% elif row.status == 'COOLDOWN' %}warn-badge{% else %}bad-badge{% endif %}">{{ row.status }}</span>
              </div>
              <div class="meta">Active: {{ row.active }} | Last heartbeat: {{ row.last_heartbeat }}</div>
              <div class="stats">
                <div class="stat">
                  <div class="stat-label">Score</div>
                  <div class="stat-value">{{ row.score }}</div>
                </div>
                <div class="stat">
                  <div class="stat-label">Streak</div>
                  <div class="stat-value">{{ row.streak }}</div>
                </div>
                <div class="stat">
                  <div class="stat-label">Wins</div>
                  <div class="stat-value">{{ row.wins }}</div>
                </div>
                <div class="stat">
                  <div class="stat-label">Losses</div>
                  <div class="stat-value">{{ row.losses }}</div>
                </div>
              </div>
              <div class="meta">Cooldown: {{ row.cool_down_until }}</div>
              <div class="meta">Notes: {{ row.notes }}</div>
            </div>
            {% endfor %}
          </div>

          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th>Status</th>
                <th>Active</th>
                <th>Score</th>
                <th>Cooldown</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {% for row in rows %}
              <tr>
                <td>{{ row.team_name }}</td>
                <td>{{ row.status }}</td>
                <td>{{ row.active }}</td>
                <td>{{ row.score }}</td>
                <td>{{ row.cool_down_until }}</td>
                <td>{{ row.notes }}</td>
              </tr>
              {% endfor %}
            </tbody>
          </table>
        </div>
      </body>
    </html>
    """
    return render_template_string(html, rows=rows, system_status=system_status)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
