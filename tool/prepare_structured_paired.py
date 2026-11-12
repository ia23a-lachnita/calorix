"""Reference-independent unused-dish and paired arm-order selection."""
import hashlib,re
from tool.transfer_dataset import select_transfer_cases

def select_paired_cases(dishes,excluded_ids,seed):
    if not isinstance(excluded_ids,(set,list,tuple)) or len(set(excluded_ids))!=len(excluded_ids) or any(not isinstance(i,str) or not re.fullmatch(r'nv-dish-(0|[1-9][0-9]*)',i) for i in excluded_ids):
        raise ValueError('Unique canonical prior-exposure exclusions required')
    if not isinstance(dishes,list) or len({r['id'] for r in dishes})!=len(dishes):raise ValueError('Unique source dish pool required')
    chosen=select_transfer_cases([r for r in dishes if r['id'] not in excluded_ids],seed,20)
    rank=lambda kind,row:(hashlib.sha256((seed+'|'+kind+'|'+row['id']).encode()).hexdigest(),row['id'])
    first={r['id'] for r in sorted(chosen,key=lambda r:rank('arm-order',r))[:10]}
    return [{**r,'armOrder':['A1','Structured'] if r['id'] in first else ['Structured','A1']} for r in sorted(chosen,key=lambda r:rank('execution',r))]
