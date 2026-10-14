from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import unittest

from dashboard import create_app


class LoginTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory();self.addCleanup(self.directory.cleanup)
        self.db=Path(self.directory.name)/'test.db'
        self.app=create_app(self.db, settings_path=Path(self.directory.name)/'.env.local')
        self.client=self.app.test_client()
        self.password='fixture-only-password-123'

    def csrf(self,client=None):
        client=client or self.client
        with client.session_transaction() as session:return session['login_csrf']

    def setup_owner(self):
        self.client.get('/auth/setup')
        return self.client.post('/auth/setup',data={'password':self.password,'confirm':self.password,'csrf':self.csrf()},headers={'Origin':'http://localhost'})

    def test_password_hash_login_gate_and_no_key_leak(self):
        self.assertEqual(self.setup_owner().status_code,302)
        anonymous=self.app.test_client()
        for path in ['/api/settings','/api/market-data','/api/server-practice','/api/reviews']:
            self.assertEqual(anonymous.get(path).status_code,401)
        self.assertEqual(anonymous.get('/').status_code,302)
        self.assertEqual(self.client.get('/api/settings').status_code,200)
        with closing(sqlite3.connect(self.db)) as c:
            hashed=c.execute('SELECT password_hash FROM owner_login').fetchone()[0]
            self.assertTrue(hashed.startswith('scrypt:'));self.assertNotIn(self.password,hashed)
        self.assertEqual(anonymous.get('/auth/setup',headers={'Host':'public.example'}).status_code,403)

    def test_creation_requires_matching_password_and_same_origin_csrf(self):
        self.client.get('/auth/setup');body={'password':self.password,'confirm':self.password,'csrf':self.csrf()}
        self.assertEqual(self.client.post('/auth/setup',data=body,headers={'Origin':'https://foreign.example'}).status_code,403)
        self.assertEqual(self.client.post('/auth/setup',data=dict(body,confirm='different'),headers={'Origin':'http://localhost'}).status_code,400)
        self.assertEqual(self.client.get('/api/settings').status_code,200) # prior loopback behavior
        self.assertEqual(self.setup_owner().status_code,302)

    def test_failed_logins_throttle_and_authenticated_session_persists_restart(self):
        self.setup_owner()
        app2=create_app(self.db,settings_path=Path(self.directory.name)/'.env.local')
        restored=app2.test_client();cookie=self.client.get_cookie('laylow_owner');restored.set_cookie('laylow_owner',cookie.value)
        self.assertEqual(restored.get('/api/settings').status_code,200)
        other=app2.test_client();other.get('/auth/login');token=self.csrf(other)
        for i in range(5):
            self.assertEqual(other.post('/auth/login',data={'password':'wrong-password-here','csrf':token},headers={'Origin':'http://localhost'}).status_code,401)
        self.assertEqual(other.post('/auth/login',data={'password':self.password,'csrf':token},headers={'Origin':'http://localhost'}).status_code,429)

    def test_logout_revokes_cookie_and_login_restores_access(self):
        self.setup_owner();old=self.client.get_cookie('laylow_owner').value
        self.client.get('/auth/login');token=self.csrf()
        self.assertEqual(self.client.post('/auth/logout',data={'csrf':token},headers={'Origin':'http://localhost'}).status_code,302)
        replay=self.app.test_client();replay.set_cookie('laylow_owner',old)
        self.assertEqual(replay.get('/api/settings').status_code,401)
        self.client.get('/auth/login')
        response=self.client.post('/auth/login',data={'password':self.password,'csrf':self.csrf()},headers={'Origin':'http://localhost'})
        self.assertEqual(response.status_code,302);self.assertEqual(self.client.get('/api/settings').status_code,200)


if __name__=='__main__':unittest.main()
