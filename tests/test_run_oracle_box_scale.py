import hashlib,tempfile,unittest
from pathlib import Path
from tool.run_oracle_box_scale import checked_asset,validate_manifest
class OracleRunnerTests(unittest.TestCase):
 def test_pinned_asset_and_escape_or_drift(self):
  with tempfile.TemporaryDirectory() as directory:
   root=Path(directory);p=root/'box.xml';p.write_bytes(b'owned-fixture');raw=p.read_bytes();row={'annotationPath':'box.xml','annotationSha256':hashlib.sha256(raw).hexdigest(),'annotationGitBlobSha':hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()};self.assertEqual(checked_asset(root,row,'annotation'),raw)
   row['annotationPath']='../outside.xml'
   with self.assertRaises(ValueError):checked_asset(root,row,'annotation')
   row['annotationPath']='box.xml';p.write_bytes(b'changed')
   with self.assertRaises(ValueError):checked_asset(root,row,'annotation')
 def test_manifest_exact_membership_and_group_disjointness(self):
  m={'train':[{'id':'bread001'}],'comparison':[{'id':'bread002'}],'baselineA1':{'bread002':20}}
  validate_manifest(m,{'trainCount':1,'comparisonCount':1});m['comparison'][0]['id']='bread001'
  with self.assertRaises(ValueError):validate_manifest(m,{'trainCount':1,'comparisonCount':1})
  with self.assertRaises(ValueError):validate_manifest(m,{'trainCount':2,'comparisonCount':1})
