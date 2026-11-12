/* Evaluator-only; production schema and callable remain unchanged. */
const crypto=require('node:crypto');
const VERSION='structured-food-routing-v1';
const CATEGORIES=Object.freeze(['bread','bun','doughnut','fried_dough_twist','mooncake','sachima','other','uncertain']);
const METHODS={bread:['baked','toasted'],bun:['steamed'],doughnut:['fried'],fried_dough_twist:['fried'],mooncake:['baked'],sachima:['fried']};
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const clone=x=>structuredClone(x);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>object(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const routingFields=['category','count','form','variant','abstainReason'];
const routingWire={type:'object',additionalProperties:false,properties:{category:{type:'string',enum:CATEGORIES},count:{type:'string',enum:['one','multiple','partial','unknown']},form:{type:'string',enum:['bread_slice','whole_item','partial','unknown']},variant:{type:'string',enum:['standard','modified','uncertain']},abstainReason:{anyOf:[{type:'string'},{type:'null'}]}},required:routingFields};
function validateRouting(r){
 if(!exact(r,routingFields)||!CATEGORIES.includes(r.category)||!routingWire.properties.count.enum.includes(r.count)||!routingWire.properties.form.enum.includes(r.form)||!routingWire.properties.variant.enum.includes(r.variant)||!(r.abstainReason===null||(typeof r.abstainReason==='string'&&r.abstainReason.trim().length>0&&r.abstainReason.length<=120)))throw Error('Invalid structured routing metadata');
}
function buildSchema(baseSchema){
 const out=clone(baseSchema),item=out?.properties?.components?.items;
 if(!object(item?.properties)||!Array.isArray(item.required)||Object.hasOwn(item.properties,'evalRouting'))throw Error('Original component schema required');
 item.properties.evalRouting=clone(routingWire);item.required.push('evalRouting');return out;
}
function buildPrompt(basePrompt){
 if(typeof basePrompt!=='string'||!basePrompt.trim())throw Error('Original prompt required');
 return basePrompt+'\n'+VERSION+`: For EACH component also return evalRouting with category (${CATEGORIES.join('|')}), count (one|multiple|partial|unknown), form (bread_slice|whole_item|partial|unknown), variant (standard|modified|uncertain), abstainReason (null or a short nonempty explanation). Classify from the visible food, not its display-name spelling. bread means a bread slice, not cake; bun means a plain steamed bun; doughnut means an undecorated ring doughnut; fried_dough_twist means a twisted fried dough item; mooncake means a whole baked mooncake; sachima means a cohesive fried-noodle/syrup bar. Use other for non-target foods and uncertain when identification is unresolved. One component is NOT necessarily one physical item: multiple pieces, partial items, occlusion and uncertain count must be reported. Standard means the intrinsic class form, not fat-free or filling-free: frying is intrinsic to doughnuts/twists/sachima and filling is intrinsic to mooncakes. Conspicuous additional coatings, decorations or nonstandard fillings are modified. Do not claim hidden recipes are verified; if uncertainty prevents comparison with the class form, use uncertain and give abstainReason. A full single bread slice has form bread_slice; intact target items otherwise have whole_item. Give an abstainReason for other/uncertain categories or unresolved suitability. Do NOT change nutrient provenance, invent a measured weight, or use a typical-serving prior in massG; first estimate the entire visible edible mass independently. Routing is an experimental model estimate, not a verified observation.`;
}
function bind(estimate,routing){return {schemaVersion:1,estimate,routing,bindingSha256:hash(JSON.stringify({estimate,routing}))};}
function decodeStructuredOutput(text,engine){
 const raw=JSON.parse(text);
 if(!object(raw)||!Array.isArray(raw.components))throw Error('Invalid structured routing inventory');
 const routing=raw.components.map(c=>{if(!object(c))throw Error('Invalid structured routing component');validateRouting(c.evalRouting);return clone(c.evalRouting);});
 const bare=clone(raw);for(const c of bare.components)delete c.evalRouting;
 return bind(engine.decodeTier1Output(JSON.stringify(bare)),routing);
}
function validatePriors(priors){
 if(!object(priors)||![Object.prototype,null].includes(Object.getPrototypeOf(priors))||Object.keys(priors).some(k=>!Object.hasOwn(METHODS,k)))throw Error('Classes-only prior map required');
 for(const p of Object.values(priors)){
  if(!exact(p,['medianMassG','fitGroups','qualification','sourceReceiptSha256'])||typeof p.medianMassG!=='number'||!Number.isFinite(p.medianMassG)||p.medianMassG<=0||p.medianMassG>100000||!Number.isInteger(p.fitGroups)||p.fitGroups<0||typeof p.qualification!=='string'||typeof p.sourceReceiptSha256!=='string'||!/^[a-f0-9]{64}$/.test(p.sourceReceiptSha256))throw Error('Invalid qualified prior');
 }
}
function routeStructuredEstimate(decoded,priors){
 validatePriors(priors);
 if(!exact(decoded,['schemaVersion','estimate','routing','bindingSha256'])||decoded.schemaVersion!==1||decoded.bindingSha256!==hash(JSON.stringify({estimate:decoded.estimate,routing:decoded.routing})))throw Error('Structured receipt binding mismatch');
 const original=decoded.estimate;
 if(!Array.isArray(decoded.routing)||decoded.routing.length!==original?.components?.length)throw Error('Routing receipt length mismatch');
 decoded.routing.forEach(validateRouting);
 if(original.portionPrior||original.question?.answered)throw Error('Original uncorrected estimate required');
 const estimate=clone(original),fallback=reason=>({status:'fallback',reason,predictedCategory:null,estimate});
 if(estimate.components.length!==1)return fallback('multiple_components');
 const r=decoded.routing[0],category=r.category;
 if(!Object.hasOwn(METHODS,category))return fallback('unsupported_or_uncertain_category');
 if(r.count!=='one')return fallback('not_one_complete_item');
 if(r.form!==(category==='bread'?'bread_slice':'whole_item'))return fallback('incompatible_form');
 if(r.variant!=='standard'||r.abstainReason!==null)return fallback('modified_or_unresolved_variant');
 const prep=estimate.components[0].preparation.toLowerCase().split(/[^a-z]+/);
 const methods=prep.filter(w=>['baked','toasted','steamed','fried','boiled','roasted','grilled','poached','raw','uncooked','unbaked','unknown'].includes(w));
 if(!methods.length||prep.some(w=>['not','never','partially','possibly','uncertain','unclear'].includes(w))||methods.some(w=>!METHODS[category].includes(w)))return fallback('incompatible_preparation');
 const prior=priors[category];
 if(!prior||prior.qualification!=='train_single_unit_v1'||prior.fitGroups<3)return fallback('no_qualified_prior');
 const component=estimate.components[0],originalMassG=component.massG,factor=prior.medianMassG/originalMassG;
 if(!Number.isFinite(factor)||factor<=0)throw Error('Invalid structured routing scale factor');
 component.massG=prior.medianMassG;
 for(const key of ['kcal','proteinG','carbsG','fatG']){
  component.nutrients[key]*=factor;
  if(!Number.isFinite(component.nutrients[key])||component.nutrients[key]<0)throw Error('Invalid structured routing scaled nutrient');
 }
 estimate.totals=clone(component.nutrients);estimate.requiresReview=true;
 estimate.portionPrior={id:VERSION,category,sourceReceiptSha256:prior.sourceReceiptSha256,fitGroups:prior.fitGroups,originalMassG,priorMassG:prior.medianMassG,measuredMass:false,assumption:'Approximate typical mass of visually qualified training units; model category/count/form remain unverified'};
 return {status:'applied',reason:'structured_category_and_qualified_unit_prior',predictedCategory:category,estimate};
}
async function inferStructuredTier1(photo,engine,generate){
 if(typeof photo!=='string'||!photo||typeof generate!=='function')throw Error('Validated JPEG and one-dispatch generator required');
 const prompt=buildPrompt(engine.TIER1_PROMPT),schema=buildSchema(engine.TIER1_RESPONSE_SCHEMA),start=Date.now();
 const response=await generate({model:engine.TIER1_MODEL,contents:[{role:'user',parts:[{text:prompt},{inlineData:{mimeType:'image/jpeg',data:photo}}]}],config:{responseMimeType:'application/json',responseJsonSchema:schema,thinkingConfig:{thinkingLevel:'LOW'},maxOutputTokens:8192}});
 if(response.modelVersion!==engine.TIER1_MODEL)throw Error('Unexpected returned model version');
 if(!response.text)throw Error('Empty model response');
 const decoded=decodeStructuredOutput(response.text,engine);
 decoded.estimate.provenance={...decoded.estimate.provenance,model:engine.TIER1_MODEL,promptSha256:hash(prompt),schemaSha256:hash(JSON.stringify(schema)),returnedModel:response.modelVersion,latencyMs:Date.now()-start,inputTokens:response.usageMetadata?.promptTokenCount??null,outputTokens:response.usageMetadata?.candidatesTokenCount??null,costUsd:null};
 return bind(decoded.estimate,decoded.routing);
}
module.exports={VERSION,CATEGORIES,buildSchema,buildPrompt,decodeStructuredOutput,validatePriors,routeStructuredEstimate,inferStructuredTier1};
