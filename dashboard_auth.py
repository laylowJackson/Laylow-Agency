"""Optional owner login for the loopback app. Never a GitHub Pages password gate."""
from contextlib import closing
import hashlib
import secrets
import sqlite3
import time
from pathlib import Path

from flask import jsonify, redirect, render_template_string, request, session
from werkzeug.security import check_password_hash, generate_password_hash

PAGE = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Laylow Agency · Owner login</title>
<style>body{background:#081321;color:#eaf2ff;font:16px system-ui;margin:0;display:grid;min-height:100vh;place-items:center}main{max-width:420px;margin:20px;padding:32px;background:#13243b;border:1px solid #385f92;border-radius:20px}h1{font-size:26px}input,button{box-sizing:border-box;width:100%;font:inherit;padding:14px;margin:10px 0;border-radius:9px}input{background:#081321;color:white;border:1px solid #6082ae}button{background:#4c83ff;color:white;border:0;cursor:pointer}p{line-height:1.6}label{display:block}.error{color:#ffb5b5}</style>
<main><h1>{{ heading }}</h1><p>{{ explanation }}</p><p class="error" role="status">{{ message }}</p>
<form method="post"><input type="hidden" name="csrf" value="{{ csrf }}"><label>Password<input name="password" type="password" required minlength="12" maxlength="256" autocomplete="{{ autocomplete }}"></label>{% if setup %}<label>Confirm password<input name="confirm" type="password" required minlength="12" maxlength="256" autocomplete="new-password"></label>{% endif %}<button>{{ button }}</button></form>
{% if authenticated %}<form method="post" action="/auth/logout"><input type="hidden" name="csrf" value="{{ csrf }}"><button>Sign out</button></form>{% endif %}<p>Broker keys stay on the Python server. This login does not enable real-money trading.</p></main></html>'''


def install_auth(app, database):
    def connection(read_only=False):
        if read_only:
            return sqlite3.connect(Path(database).resolve().as_uri()+'?mode=ro', uri=True, timeout=5)
        return sqlite3.connect(database, timeout=5)

    with closing(connection()) as c:
        c.executescript('CREATE TABLE IF NOT EXISTS owner_login (id INTEGER PRIMARY KEY CHECK(id=1), signing_secret TEXT NOT NULL, password_hash TEXT); CREATE TABLE IF NOT EXISTS owner_sessions (token_hash TEXT PRIMARY KEY, expires REAL NOT NULL); CREATE TABLE IF NOT EXISTS owner_failures (created REAL NOT NULL);')
        c.execute('INSERT OR IGNORE INTO owner_login VALUES (1,?,NULL)', (secrets.token_hex(32),))
        app.secret_key = c.execute('SELECT signing_secret FROM owner_login WHERE id=1').fetchone()[0]
        c.commit()
    app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE='Strict',
                      SESSION_COOKIE_SECURE=False, SESSION_COOKIE_NAME='laylow_owner')
    # HTTP cookie is only for loopback/SSH access. Remote HTTPS is not enabled here.

    def configured():
        with closing(connection(True)) as c:
            return c.execute('SELECT password_hash FROM owner_login WHERE id=1').fetchone()[0]

    def authenticated():
        token = session.get('owner_token')
        if not isinstance(token, str): return False
        with closing(connection(True)) as c:
            row = c.execute('SELECT expires FROM owner_sessions WHERE token_hash=?', (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
        return bool(row and row[0] > time.time())

    def login_session():
        session.clear()
        token = secrets.token_urlsafe(32)
        session['owner_token'] = token
        with closing(connection()) as c:
            c.execute('DELETE FROM owner_sessions WHERE expires<=?', (time.time(),))
            c.execute('INSERT INTO owner_sessions VALUES (?,?)', (hashlib.sha256(token.encode()).hexdigest(),time.time()+8*3600))
            c.commit()

    def valid_form():
        token = session.get('login_csrf', '')
        origin = request.headers.get('Origin')
        return bool(token and secrets.compare_digest(str(request.form.get('csrf','')),token) and origin == request.host_url.rstrip('/'))

    @app.before_request
    def require_owner():
        if request.path in {'/auth/login','/auth/setup','/auth/logout','/healthz'}: return None
        try:
            locked = configured()
            if locked and not authenticated():
                if request.path.startswith('/api/'):
                    return jsonify({'error':'login_required','login_url':'/auth/login'}),401
                return redirect('/auth/login')
        except sqlite3.Error:
            return jsonify({'error':'login_unavailable','database_available':False}),503

    def show(setup, message='', code=200):
        session.setdefault('login_csrf', secrets.token_urlsafe(32))
        return render_template_string(PAGE, setup=setup, csrf=session['login_csrf'],message=message,
             authenticated=authenticated(),
             heading='Protect your local dashboard' if setup else 'Laylow owner login',
             explanation='Choose a password of at least 12 characters. This protects this Python app; the public GitHub website is separate.' if setup else 'Sign in to access your dashboard and private broker settings.',
             autocomplete='new-password' if setup else 'current-password',
             button='Set password and sign in' if setup else 'Sign in'),code

    @app.route('/auth/setup', methods=['GET','POST'])
    def setup():
        if configured(): return redirect('/auth/login')
        if request.method == 'POST':
            if not valid_form(): return show(True,'Reload this page and try again.',403)
            password=request.form.get('password','')
            if not 12 <= len(password) <= 256 or password != request.form.get('confirm'):
                return show(True,'Use 12–256 characters and matching passwords.',400)
            hashed=generate_password_hash(password)
            with closing(connection()) as c:
                c.execute('BEGIN IMMEDIATE')
                if c.execute('SELECT password_hash FROM owner_login WHERE id=1').fetchone()[0]:
                    return redirect('/auth/login')
                c.execute('UPDATE owner_login SET password_hash=? WHERE id=1',(hashed,));c.commit()
            login_session();return redirect('/#settings')
        return show(True)

    @app.route('/auth/login', methods=['GET','POST'])
    def login():
        hashed=configured()
        if not hashed: return redirect('/auth/setup')
        if request.method == 'POST':
            if not valid_form(): return show(False,'Reload this page and try again.',403)
            with closing(connection()) as c:
                c.execute('DELETE FROM owner_failures WHERE created<?',(time.time()-900,))
                attempts=c.execute('SELECT COUNT(*) FROM owner_failures').fetchone()[0];c.commit()
            if attempts >= 5: return show(False,'Too many attempts. Wait 15 minutes.',429)
            password=request.form.get('password','')
            if not 12 <= len(password) <= 256 or not check_password_hash(hashed,password):
                with closing(connection()) as c:
                    c.execute('INSERT INTO owner_failures VALUES (?)',(time.time(),));c.commit()
                return show(False,'Incorrect password.',401)
            login_session();return redirect('/#settings')
        return show(False)

    @app.post('/auth/logout')
    def logout():
        if not valid_form(): return jsonify({'error':'invalid_logout_request'}),403
        token=session.get('owner_token','')
        with closing(connection()) as c:
            c.execute('DELETE FROM owner_sessions WHERE token_hash=?',(hashlib.sha256(token.encode()).hexdigest(),));c.commit()
        session.clear();return redirect('/auth/login')

    app.config['OWNER_LOGIN_CONFIGURED']=configured
