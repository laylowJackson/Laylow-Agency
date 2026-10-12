/* Dedicated browser worker: files stay on this device and no network provider is contacted. */
'use strict';
importScripts('./wick-knowledge.js?v=20261011-evidence','./practice-engine.js?v=20261011-evidence','./strategy-research.js?v=20261011-evidence','./research-evidence.js?v=20261011-evidence','./historical-research.js?v=20261011-evidence');
self.onmessage=event=>{try{const data=event.data,dataset=self.LaylowHistoricalResearch.parse(data.csv,data.metadata),report=self.LaylowHistoricalResearch.evaluate(dataset);self.postMessage({ok:true,dataset,report});}catch(e){self.postMessage({ok:false,error:e.message});}};
