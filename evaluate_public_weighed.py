"""Score published weighed public scans and explicitly linked correction exports."""
def validate_bundle(bundle):
    raise NotImplementedError('Public reference validation follows behavioral RED')

def benchmark(bundle):
    raise NotImplementedError('Weighed benchmark follows behavioral RED')

def score_corrections(workflow,bundle,links):
    raise NotImplementedError('Explicit correction bridge follows behavioral RED')

def write_json(path,value):
    raise NotImplementedError('Exclusive output follows behavioral RED')
