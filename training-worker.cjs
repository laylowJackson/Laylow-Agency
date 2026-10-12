'use strict';
// Pure research subprocess: no database, broker, credentials, or account access.
const {TrainingLab}=require('./training-engine.js'),policy=require('./training-policy.js'),fs=require('node:fs');
const input=JSON.parse(fs.readFileSync(0,'utf8')),lab=new TrainingLab();
if(input.lab)lab.restore(input.lab);
const plan=policy.plan(new Date(input.now),input.mode||'auto');
lab.step({deepTeams:plan.deepTeams});
process.stdout.write(JSON.stringify({lab:lab.export(),plan}));
