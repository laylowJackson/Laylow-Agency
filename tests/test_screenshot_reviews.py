"""Review persistence and evidence gates; never invoke a model or broker."""
import copy
from io import BytesIO
from pathlib import Path
import tempfile
import unittest
from PIL import Image
from dashboard import create_app
from screenshot_reviews import ReviewStore
from screenshot_analysis import strategy_layer


class ScreenshotReviewsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.database = Path(self.tmp.name)/'test.db'
        self.store = ReviewStore(self.database, Path(self.tmp.name)/'screenshot_reviews')
        self.app = create_app(db_path=self.database)
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
        self.headers = {'X-Laylow-CSRF': self.app.config['CONTROL_CSRF'], 'Origin':'http://localhost'}

    def image(self, fmt='PNG', role='entry'):
        data = BytesIO()
        Image.new('RGB', (640,360), '#121e30').save(data, fmt)
        data.seek(0)
        return self.store.upload(data, role)

    def review(self):
        return {'images':[self.image()], 'corrected_values':{'entry_value':100,'stop_value':95,
                 'target_value':110,'direction':'LONG','instrument':'MNQ','outcome':'unknown'},
                'annotations':[{'type':'entry','role':'entry','x':.4,'y':.5,'x2':.8,'y2':.5}],
                'linked_trade':{'trade_id':'12','source':'practice-session-123','mode':'PRACTICE',
                                'team_name':'MNQ1!'}, 'team_name':'MNQ1!'}

    def test_three_image_formats_reencoded_and_invalid_pixels_rejected(self):
        for fmt in ['PNG','JPEG','WEBP']:
            uploaded = self.image(fmt)
            self.assertEqual(uploaded['width'],640)
            with Image.open(self.store.directory/uploaded['path']) as img:
                self.assertEqual(img.format,'PNG')
        with self.assertRaises(ValueError): self.store.upload(BytesIO(b'<script>bad</script>'),'entry')
        with self.assertRaises(ValueError): self.store.upload(BytesIO(b'x'*(8*1024*1024+1)),'entry')

    def test_save_reopen_annotations_raw_preserved_and_no_fabricated_extraction(self):
        body=self.review()
        body['raw_extraction']={'entry':999,'confidence':1,'outcome':'win'}
        saved=self.store.save(body)
        self.assertIsNone(saved['raw_extraction']['entry']['value'])
        self.assertEqual(saved['raw_extraction']['confidence'],0)
        self.assertEqual(saved['raw_extraction']['outcome'],'unknown')
        self.assertEqual(saved['strategy_evaluation']['reward_risk'],2)
        self.assertTrue((self.store.directory/saved['annotated_screenshot_path']).is_file())
        raw=copy.deepcopy(saved['raw_extraction'])
        saved['corrected_values']['entry_value']=101
        saved['raw_extraction']={'confidence':1}
        corrected=self.store.save(saved)
        self.assertEqual(corrected['raw_extraction'],raw)
        self.assertEqual(self.store.get(saved['id'])['corrected_values']['entry_value'],101)
        self.assertEqual(corrected['linked_trade']['source'],'practice-session-123')
        self.assertEqual(len(self.store.list()),1)
        corrected['images']=[self.image()]
        with self.assertRaisesRegex(ValueError,'new review ID'): self.store.save(corrected)

    def test_unknown_fields_and_evidence_gates(self):
        body=self.review();body['corrected_values']={}
        saved=self.store.save(body)
        self.assertIsNone(saved['corrected_values']['entry_value'])
        self.assertIsNone(saved['strategy_evaluation']['reward_risk'])
        for bad in [float('nan'),True,-2,0]:
            body['corrected_values']={'entry_value':bad}
            with self.assertRaises(ValueError):self.store.save(body)
        body['corrected_values']={'outcome':'win'}
        with self.assertRaisesRegex(ValueError,'evidence'):self.store.save(body)
        body['corrected_values']={'conditions':[{'label':'','timing':'pre_entry'}]}
        with self.assertRaises(ValueError):self.store.save(body)
        body['id']='../outside'
        with self.assertRaises(ValueError):self.store.save(body)

    def test_six_chart_marks_render_and_reopen_without_fake_extraction(self):
        body=self.review()
        body['annotations']=[
            {'type':kind,'role':'entry','x':.25,'x2':.65,'y':y,'y2':y2}
            for kind,y,y2 in [('entry',.5,.5),('stop',.75,.75),('target',.2,.2),
                              ('structure',.4,.4),('demand',.8,.9),('supply',.25,.33)]
        ]
        saved=self.store.save(body)
        reopened=self.store.get(saved['id'])
        self.assertEqual({m['type'] for m in reopened['annotations']},
                         {'entry','stop','target','structure','demand','supply'})
        self.assertTrue(all(m['estimated'] and m['origin']=='user' for m in reopened['annotations']))
        self.assertIsNone(reopened['raw_extraction']['entry']['value'])
        self.assertEqual(reopened['raw_extraction']['visible_conditions'],[])
        with Image.open(self.store.directory/saved['annotated_screenshot_path']) as output:
            # Structure is a blue line; zones tint the pixels inside the area.
            self.assertEqual(output.getpixel((320,144)),(96,185,255))
            self.assertNotEqual(output.getpixel((320,306)),(18,30,48))

    def test_no_lookahead_no_fake_strategy_and_invalid_geometry(self):
        values={'entry_value':100,'stop_value':95,'target_value':110,'direction':'LONG',
                'conditions':[{'label':'breakout','timing':'post_entry'}]}
        self.assertEqual(strategy_layer(values)['status'],'descriptive_only')
        rules={'required_conditions':['breakout'],'min_reward_risk':2}
        result=strategy_layer(values,rules)
        self.assertEqual(result['status'],'needs_evidence')
        self.assertEqual(result['unverified_conditions'],['breakout'])
        values['conditions'][0]['timing']='pre_entry'
        self.assertEqual(strategy_layer(values,rules)['status'],'user_observations_match')
        values['stop_value']=105
        self.assertIsNone(strategy_layer(values,rules)['reward_risk'])

    def test_api_csrf_origin_file_bounds_and_large_control_guard(self):
        self.assertFalse(self.client.get('/api/reviews/status').get_json()['ai_connected'])
        body=self.review()
        self.assertEqual(self.client.post('/api/reviews',json=body).status_code,403)
        self.assertEqual(self.client.post('/api/reviews',json=body,headers={**self.headers,'Origin':'https://evil.example'}).status_code,403)
        response=self.client.post('/api/reviews',json=body,headers=self.headers)
        self.assertEqual(response.status_code,201)
        rid=response.get_json()['id']
        self.assertEqual(self.client.get('/api/reviews/'+rid).status_code,200)
        self.assertEqual(self.client.post('/api/reviews/analyze',json=['bad'],headers=self.headers).status_code,400)
        self.assertEqual(self.client.get('/api/reviews/files/originals/../../secret').status_code,404)
        self.assertEqual(self.client.get('/api/reviews',headers={'Host':'public.example'}).status_code,403)
        self.assertEqual(self.client.post('/api/settings/broker',data='x'*5000).status_code,413)

if __name__=='__main__':unittest.main()
