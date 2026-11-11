"""Independent float64 implementation of the published fixed gram readout equations."""
import numpy as np

def read_grams(raw,config):
 soft=np.asarray(raw['soft'],dtype=np.float64);totals=np.asarray(raw['log_totals'],dtype=np.float64)
 rho=np.asarray(config['densities'],dtype=np.float64)[:,0]
 direct=np.expm1(np.clip(totals[:,:2],0,8))
 mass_direct=direct[:,1];items=soft.sum(-1);blend=config['mass_blend']
 target_mass=np.expm1(blend*np.log1p(mass_direct)+(1-blend)*np.log1p(items))
 grams=soft*np.clip(target_mass/np.maximum(items,1),.2,5)[:,None]
 gap=np.maximum(target_mass-grams.sum(-1),0)
 if config['kcal_blend']>0:
  rho_direct=direct[:,0]/np.maximum(direct[:,1],1)
  rho_items=(grams@rho)/np.maximum(grams.sum(-1),1e-6)
  b=config['kcal_blend'];target=np.exp(b*np.log(np.maximum(rho_direct,1e-3))+(1-b)*np.log(np.maximum(rho_items,1e-3)))
  mean=rho.mean();centered=rho-mean;mass=grams.sum(-1,keepdims=True);goal=target[:,None]-mean
  lo=np.full_like(mass,-.5);hi=np.full_like(mass,.5)
  for _ in range(30):
   a=(lo+hi)/2;w=grams*np.exp(a*centered);low=(w@centered)[:,None]<goal*w.sum(-1,keepdims=True)
   lo=np.where(low,a,lo);hi=np.where(low,hi,a)
  w=grams*np.exp((lo+hi)/2*centered);grams=w*(mass/np.maximum(w.sum(-1,keepdims=True),1e-12))
  if config['kcal_scale']>0:
   ratio=np.clip(target*grams.sum(-1)/np.maximum(grams@rho,1e-6),.5,2)**config['kcal_scale'];grams*=ratio[:,None];gap*=ratio
 return grams,gap
