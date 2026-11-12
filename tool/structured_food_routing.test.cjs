const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const engine=require('../functions/lib/tier1-analysis.js');
const {buildSchema,buildPrompt,decodeStructuredOutput,routeStructuredEstimate,inferStructuredTier1}=require('./structured_food_routing.cjs');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const routing=(extra={})=>({category:'bread',count:'one',form:'bread_slice',variant:'standard',abstainReason:null,...extra});
function inventory(extra={}){
 return {schemaVersion:1,mealName:'Synthetic parser fixture',components:[{name:'Arbitrary display words',massG:50,catalogId:null,preparation:'baked',assumptions:[],estimatedPer100:{kcal:200,proteinG:10,carbsG:30,fatG:5},evalRouting:routing()}],ambiguities:[],askAddedFat:false,...extra};
}
const decode=(raw=inventory())=>decodeStructuredOutput(JSON.stringify(raw),engine);
const prior=(extra={})=>({medianMassG:30,fitGroups:3,qualification:'train_single_unit_v1',sourceReceiptSha256:'a'.repeat(64),...extra});
const priors=()=>({bread:prior()});
test('extended schema requires routing without mutating the original wire schema',()=>{
 const before=JSON.stringify(engine.TIER1_RESPONSE_SCHEMA),schema=buildSchema(engine.TIER1_RESPONSE_SCHEMA);
 const item=schema.properties.components.items;
 assert.ok(item.required.includes('evalRouting'));assert.equal(item.properties.evalRouting.additionalProperties,false);
 assert.deepEqual(item.properties.evalRouting.properties.count.enum,['one','multiple','partial','unknown']);
 assert.equal(JSON.stringify(engine.TIER1_RESPONSE_SCHEMA),before);
 assert.ok(buildPrompt(engine.TIER1_PROMPT).startsWith(engine.TIER1_PROMPT+'\n'));
 assert.ok(!engine.TIER1_PROMPT.includes('evalRouting'));
});
test('strict adapter removes routing before real production reconciliation',()=>{
 const raw=inventory();assert.throws(()=>engine.decodeTier1Output(JSON.stringify(raw)));
 const out=decode(raw);assert.equal(out.estimate.totals.kcal,100);
 assert.equal(out.estimate.components[0].source.kind,'unverified_vlm_estimate');
 assert.ok(!Object.hasOwn(out.estimate.rawInventory.components[0],'evalRouting'));
 assert.deepEqual(out.routing,[routing()]);
});
test('malformed routing cannot silently become a usable category',()=>{
 for(const modify of [r=>delete r.category,r=>r.category='banana',r=>r.count=1,r=>r.form='plate',r=>r.variant='probably',r=>r.abstainReason='',r=>r.abstainReason='x'.repeat(121),r=>r.referenceMass=30]){
  const raw=inventory();modify(raw.components[0].evalRouting);assert.throws(()=>decode(raw),/routing/i);
 }
 const raw=inventory();delete raw.components[0].evalRouting;assert.throws(()=>decode(raw),/routing/i);
});
test('no-food remains explicit failure through the real engine',()=>{
 assert.throws(()=>decode(inventory({components:[]})),e=>e instanceof engine.Tier1InferenceFailure&&e.category==='no_food');
});
test('category routing works independently of display-name aliases and preserves source values',()=>{
 const out=decode(),before=structuredClone(out),decision=routeStructuredEstimate(out,priors());
 assert.equal(decision.status,'applied');assert.equal(decision.predictedCategory,'bread');
 assert.equal(decision.estimate.components[0].massG,30);
 assert.deepEqual(decision.estimate.totals,{kcal:60,proteinG:3,carbsG:9,fatG:1.5});
 assert.deepEqual(decision.estimate.rawInventory,out.estimate.rawInventory);
 assert.deepEqual(decision.estimate.provenance,out.estimate.provenance);
 assert.deepEqual(decision.estimate.components[0].source,out.estimate.components[0].source);
 assert.equal(decision.estimate.requiresReview,true);assert.equal(decision.estimate.portionPrior.measuredMass,false);
 assert.deepEqual(out,before);
});
test('one component is insufficient when item count, form or variant is unsuitable',()=>{
 for(const fields of [{category:'other'},{category:'uncertain'},{count:'multiple'},{count:'partial'},{count:'unknown'},{form:'whole_item'},{form:'partial'},{form:'unknown'},{variant:'modified'},{variant:'uncertain'},{abstainReason:'Interior unclear'}]){
  const raw=inventory();raw.components[0].evalRouting=routing(fields);const decoded=decode(raw),r=routeStructuredEstimate(decoded,priors());
  assert.equal(r.status,'fallback');assert.deepEqual(r.estimate,decoded.estimate);
 }
 const raw=inventory();raw.components.push(structuredClone(raw.components[0]));const decoded=decode(raw);
 assert.equal(routeStructuredEstimate(decoded,priors()).status,'fallback');
});
test('intrinsic frying and mooncake filling are not blanket rejected',()=>{
 for(const [category,preparation] of [['doughnut','fried'],['fried_dough_twist','deep fried'],['mooncake','baked'],['sachima','fried']]){
  const raw=inventory();raw.components[0].preparation=preparation;raw.components[0].evalRouting=routing({category,form:'whole_item'});
  assert.equal(routeStructuredEstimate(decode(raw),{[category]:prior()}).status,'applied');
 }
});
test('known cooking methods must match category and raw or unknown preparation abstains',()=>{
 for(const prep of ['raw','uncooked baked','unbaked','unknown','fried','steamed','baked and fried']){
  const raw=inventory();raw.components[0].preparation=prep;assert.equal(routeStructuredEstimate(decode(raw),priors()).status,'fallback');
 }
});
test('missing, generic and insufficient priors retain raw estimate',()=>{
 for(const table of [{},{bread:prior({qualification:'generic_serving'})},{bread:prior({fitGroups:2})}]){
  const out=decode();assert.equal(routeStructuredEstimate(out,table).status,'fallback');
 }
});
test('invalid prior maps fail before routing rather than accepting reference metadata',()=>{
 for(const table of [{classes:priors(),fitIds:['a']},{bread:prior({medianMassG:NaN})},{bread:prior({medianMassG:true})},{bread:prior({medianMassG:0})},{bread:prior({fitGroups:3.5})},{bread:prior({sourceReceiptSha256:'bad'})}])assert.throws(()=>routeStructuredEstimate(decode(),table),/prior/i);
});
test('prototype-inherited priors cannot bypass qualification validation',()=>{
 const table=Object.create({bread:prior({medianMassG:NaN})});
 assert.throws(()=>routeStructuredEstimate(decode(),table),/prior/i);
});
test('negated or partially completed cooking descriptions cannot qualify a prior',()=>{
 for(const prep of ['not baked','never baked','partially baked','possibly baked']){
  const raw=inventory();raw.components[0].preparation=prep;
  assert.equal(routeStructuredEstimate(decode(raw),priors()).status,'fallback');
 }
});
test('receipt binding rejects swapped categories or edited estimates',()=>{
 const out=decode();out.routing[0].category='mooncake';assert.throws(()=>routeStructuredEstimate(out,priors()),/receipt|binding/i);
 const changed=decode();changed.estimate.components[0].massG=2;assert.throws(()=>routeStructuredEstimate(changed,priors()),/receipt|binding/i);
});
test('subnormal masses cannot produce successful nonfinite or zero-factor prior scaling',()=>{
 for(const massG of [5e-324,1e-320]){
  const raw=inventory();raw.components[0].massG=massG;
  assert.throws(()=>routeStructuredEstimate(decode(raw),priors()),/scal/i);
 }
 assert.throws(()=>routeStructuredEstimate(decode(),{bread:prior({medianMassG:5e-324})}),/scal/i);
});
test('answered and already-corrected estimates cannot be scaled twice',()=>{
 const raw=inventory({askAddedFat:true});const decoded=decode(raw);decoded.estimate=engine.answerPreparation(decoded.estimate,'none');
 assert.throws(()=>routeStructuredEstimate(decoded,priors()));
 const applied=routeStructuredEstimate(decode(),priors());const wrapped={...decode(),estimate:applied.estimate};assert.throws(()=>routeStructuredEstimate(wrapped,priors()));
});
test('same photo dispatch produces validated raw estimate and pinned routing receipt in one call',async()=>{
 let calls=0,request;
 const out=await inferStructuredTier1('test-jpeg',engine,async r=>{calls++;request=r;return {modelVersion:'gemini-3.8-flash',text:JSON.stringify(inventory()),usageMetadata:{promptTokenCount:10,candidatesTokenCount:20}};});
 assert.equal(calls,1);assert.equal(request.model,'gemini-3.8-flash');
 assert.equal(request.contents[0].parts[1].inlineData.data,'test-jpeg');
 assert.deepEqual(request.config.thinkingConfig,{thinkingLevel:'LOW'});assert.equal(request.config.maxOutputTokens,8192);
 assert.equal(out.estimate.provenance.promptSha256,hash(request.contents[0].parts[0].text));
 assert.equal(out.estimate.provenance.schemaSha256,hash(JSON.stringify(request.config.responseJsonSchema)));
 assert.equal(out.estimate.provenance.inputTokens,10);assert.equal(out.estimate.provenance.costUsd,null);
 assert.equal(routeStructuredEstimate(out,priors()).status,'applied');
});
test('model drift, empty text and HTTP504 reject after exactly one dispatch',async()=>{
 for(const response of [{modelVersion:'other',text:JSON.stringify(inventory())},{modelVersion:'gemini-3.8-flash',text:''}]){
  let calls=0;await assert.rejects(inferStructuredTier1('test-jpeg',engine,async()=>{calls++;return response;}));assert.equal(calls,1);
 }
 let calls=0;await assert.rejects(inferStructuredTier1('test-jpeg',engine,async()=>{calls++;throw Object.assign(new Error('private provider detail'),{status:504});}),e=>e.status===504);assert.equal(calls,1);
});
