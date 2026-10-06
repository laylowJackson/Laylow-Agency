from flask import Flask, render_template_string
import sqlite3

app = Flask(__name__)


def get_db_connection():
    conn = sqlite3.connect('team_status.db')
    conn.row_factory = sqlite3.Row
    return conn


@app.route('/')
def index():
    conn = get_db_connection()
    teams = conn.execute("""
        SELECT team_name, status, last_heartbeat, active, notes
        FROM team_status
        ORDER BY team_name
    """).fetchall()

    scores = conn.execute("""
        SELECT team_name, score, wins, losses, streak, is_disabled, cool_down_until
        FROM team_scores
        ORDER BY team_name
    """).fetchall()

    conn.close()

    rows = []
    score_map = {row["team_name"]: row for row in scores}

    for team in teams:
        score_row = score_map.get(team["team_name"])
        rows.append({
            "team_name": team["team_name"],
            "status": team["status"],
            "last_heartbeat": team["last_heartbeat"],
            "active": team["active"],
            "notes": team["notes"],
            "score": score_row["score"] if score_row else 0,
            "wins": score_row["wins"] if score_row else 0,
            "losses": score_row["losses"] if score_row else 0,
            "streak": score_row["streak"] if score_row else 0,
            "is_disabled": score_row["is_disabled"] if score_row else 0,
            "cool_down_until": score_row["cool_down_until"] if score_row else "N/A",
        })

    html = """
    <html>
      <head>
        <title>Trading System Dashboard</title>
        <style>
          body { font-family: Arial, sans-serif; background: #111827; color: #f3f4f6; margin: 30px; }
          h1 { margin-bottom: 20px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #374151; padding: 10px; text-align: left; }
          th { background: #1f2937; }
          tr:nth-child(even) { background: #1f2937; }
          .good { color: #34d399; }
          .bad { color: #f87171; }
          .warn { color: #fbbf24; }
        </style>
      </head>
      <body>
        <h1>Trading System Dashboard</h1>
        <table>
          <tr>
            <th>Team</th>
            <th>Status</th>
            <th>Active</th>
            <th>Last Heartbeat</th>
            <th>Score</th>
            <th>Wins</th>
            <th>Losses</th>
            <th>Streak</th>
            <th>Cooldown</th>
            <th>Notes</th>
          </tr>
          {% for row in rows %}
          <tr>
            <td>{{ row.team_name }}</td>
            <td class="{% if row.status == 'RUNNING' %}good{% elif row.status == 'DOWN' %}bad{% else %}warn{% endif %}">{{ row.status }}</td>
            <td>{{ row.active }}</td>
            <td>{{ row.last_heartbeat }}</td>
            <td>{{ row.score }}</td>
            <td>{{ row.wins }}</td>
            <td>{{ row.losses }}</td>
            <td>{{ row.streak }}</td>
            <td>{{ row.cool_down_until }}</td>
            <td>{{ row.notes }}</td>
          </tr>
          {% endfor %}
        </table>
      </body>
    </html>
    """
    return render_template_string(html, rows=rows)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
