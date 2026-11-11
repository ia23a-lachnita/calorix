"""Pinned Calorie Lens decoding and a reference-blind exploratory serving router."""
import copy, csv, hashlib, io, math
from tool.open_model_adapters import fuse_mass
from tool.paired_view_metrics import _metrics
from tool.reference_scale import metrics as mass_metrics

FIELDS=('kcal','proteinG','carbsG','fatG')
PUBLISHER=('kcal','protein_g','carb_g','fat_g')
def finite(value, positive=False):
 if type(value) not in (int,float) or not math.isfinite(value) or value<0 or (positive and value<=0):raise ValueError('Invalid finite physical quantity')
 return float(value)
def vector(value):
 return {'massG':finite(value['massG'],True),'totals':{k:finite(value['totals'][k]) for k in FIELDS}}
def density_records(config, metadata_bytes, expected_sha):
 if hashlib.sha256(metadata_bytes).hexdigest()!=expected_sha:raise ValueError('Pinned nutrient metadata required')
 rows={int(r['id']):r for r in csv.DictReader(io.StringIO(metadata_bytes.decode()))};out=[]
 if not (len(config['ingredient_ids'])==len(config['ingredients'])==len(config['densities'])):raise ValueError('Aligned ingredient table required')
 for i,name,density in zip(config['ingredient_ids'],config['ingredients'],config['densities']):
  if type(i) is not int or not isinstance(name,str) or len(density)!=8:raise ValueError('Invalid table row')
  for v in density:finite(v)
  ref=rows.get(i);match=bool(ref and ref['ingr']==name and all(abs(float(ref[k])-v)<=1e-6 for k,v in zip(['cal/g','fat(g)','carb(g)','protein(g)'],density[:4])))
  out.append({'kind':'nutrition5k_dataset_record' if match else 'unverified_publisher_table','recordId':i,'name':name,'coreNutrientsMatched':match,'sourceSha256':expected_sha,'sourceUrl':'https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset/metadata/ingredients_metadata.csv','extendedUsdaVerified':False})
 return out
def decode_lens(summary,raw,config,sources):
 def decode(s):return vector({'massG':s['mass_g'],'totals':{a:s[b] for a,b in zip(FIELDS,PUBLISHER)}})
 result=decode(summary['totals']);grams=raw['grams']
 if len(grams)!=1 or len(grams[0])!=len(config['ingredients']) or len(sources)!=len(grams[0]) or len(raw['mass_gap'])!=1 or len(raw['logits'])!=1 or len(raw['logits'][0])!=len(grams[0]):raise ValueError('Pinned full ingredient output required')
 parts=[]
 for i,g in enumerate(grams[0]):
  g=finite(g);z=raw['logits'][0][i]
  if type(z) not in (int,float) or not math.isfinite(z):raise ValueError('Invalid presence output')
  density=config['densities'][i];parts.append({'name':config['ingredients'][i],'massG':g,'source':copy.deepcopy(sources[i]),'foodIdentityVerified':False,'amountVerified':False,'nutrients':dict(zip(['kcal','fatG','carbsG','proteinG'],[g*finite(x) for x in density[:4]]))})
 gap=finite(raw['mass_gap'][0]);mass=math.fsum(p['massG'] for p in parts)+gap
 if abs(mass-result['massG'])>.051:raise ValueError('Publisher rounded mass disagrees with full output')
 try:direct=decode(summary['direct_estimate'])
 except (ValueError,KeyError,TypeError):direct=None
 return {**result,'components':parts,'massGapG':gap,'directHead':direct,'nutrientSourceKind':'published_dataset_table_estimate','identityAndPortionVerified':False,'referenceMassUsed':False}
def route_specialist(a1,specialist):
 try:
  if not a1 or not a1['components']:raise ValueError('Missing A1')
  grams=[finite(c['massG'],True) for c in a1['components']];base=vector({'massG':math.fsum(grams),'totals':a1['totals']})
 except (KeyError,TypeError,ValueError):
  return {'status':'failed','eligible':False,'selectedSource':None,'reason':'a1_failed_or_missing','massG':None,'totals':None}
 eligible=base['massG']>=150 and len(grams)>=2;chosen=base;source='A1';reason='outside_fixed_serving_gate'
 if eligible:
  try:
   if not specialist or specialist.get('status')!='ok':raise ValueError('Missing specialist')
   chosen=vector(specialist);source='specialist';reason='fixed_serving_gate'
  except (KeyError,TypeError,ValueError):reason='specialist_failed'
 return {**chosen,'status':'ok','eligible':eligible,'selectedSource':source,'reason':reason,'originalA1EstimatedMassG':base['massG'],'componentRows':len(grams),'nutrientSourceKind':'retained_A1_provenance' if source=='A1' else specialist.get('nutrientSourceKind',specialist.get('directNutrientSourceKind','unverified_published_model_estimate')),'referenceUsed':False}
def summarize_routes(cases,predictions):
 ids={c['id'] for c in cases}
 if len(ids)!=len(cases) or set(predictions)-ids:raise ValueError('Unique fixed case membership required')
 groups={};routing={}
 for group in ['discovery10','validation20']:
  subset=[c for c in cases if c['group']==group];rows={a:[] for a in ['baseline','direct','gated','massFusion','directHead']}
  for c in subset:
   p=predictions.get(c['id'],{});a1=c.get('a1Estimate');g=route_specialist(a1,p);routing[c['id']]=g;baseline=route_specialist(a1,None)
   values={'baseline':baseline,'direct':p if p.get('status')=='ok' else None,'gated':g,'massFusion':None,'directHead':p.get('directHead') if p.get('status')=='ok' else None}
   if p.get('status')=='ok' and a1 and p.get('massG'):
    try:values['massFusion']=fuse_mass(a1,p['massG'],{'kind':'pinned_specialist_mass'})
    except (ValueError,KeyError,TypeError):pass
   for route,v in values.items():
    try:valid=vector(v);pred={**valid['totals'],'massG':valid['massG']}
    except (ValueError,KeyError,TypeError):pred=None
    rows[route].append({'id':c['id'],'reference':c['reference'],'predicted':pred})
  groups[group]={route:_metrics(rs) for route,rs in rows.items()};groups[group]['routeCounts']={source:sum(routing[c['id']]['selectedSource']==source for c in subset) for source in ['A1','specialist',None]}
 old=[c for c in cases if c['group']=='ecust-old'];fresh=[c for c in cases if c['group']=='ecust-fresh']
 def massrows(subset,route):
  pairs=[]
  for c in subset:
   p=predictions.get(c['id'],{});g=route_specialist(c.get('a1Estimate'),p);v=g if route=='gated' else route_specialist(c.get('a1Estimate'),None) if route=='baseline' else p
   try:mass=finite(v['massG'],True) if v.get('status')=='ok' else None
   except (ValueError,KeyError,TypeError):mass=None
   pairs.append((c['reference']['massG'],mass))
   if c in old:routing[c['id']]=g
  return mass_metrics(pairs)
 ec={'old':{route:massrows(old,route) for route in ['baseline','direct','gated']},'fresh':{'direct':massrows(fresh,'direct'),'hybrid':None},'energy':None}
 b=groups['validation20']['baseline'];g=groups['validation20']['gated'];valid=len([c for c in cases if c['group']=='validation20'])==20 and b['scored']==20 and g['scored']==20
 oldvalid=len(old)==6 and ec['old']['baseline']['scored']==6 and ec['old']['gated']['scored']==6
 guards={'all20Valid':valid,'maeAtLeast10PercentBetter':valid and b['served']['mae_kcal']>0 and g['served']['mae_kcal']<=.9*b['served']['mae_kcal'],'medianNotWorse':valid and g['served']['median_absolute_error_kcal']<=b['served']['median_absolute_error_kcal'],'p90NotWorse':valid and g['served']['p90_absolute_error_kcal']<=b['served']['p90_absolute_error_kcal'],'normalizedNotWorse':valid and g['served']['mean_normalized_absolute_error']<=b['served']['mean_normalized_absolute_error'],'old6Coverage':oldvalid,'old6MassMaeNotWorse':oldvalid and ec['old']['gated']['maeG']<=ec['old']['baseline']['maeG'],'old6MassP90NotWorse':oldvalid and ec['old']['gated']['p90AbsoluteErrorG']<=ec['old']['baseline']['p90AbsoluteErrorG']}
 return {**groups,'ecust':ec,'routing':routing,'screen':{'guards':guards,'passesAll':all(guards.values())},'productionPromotable':False}
