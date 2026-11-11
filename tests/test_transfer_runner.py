import unittest
import subprocess
import sys
import json
from pathlib import Path
import tempfile
from tool.run_transfer_lens import require_transfer_rights, validate_image_case


class TransferRunnerTest(unittest.TestCase):
    def test_purpose_is_a_required_gate_not_a_default_assumption(self):
        for profile in [{},{'rights':{}},{'rights':{'evaluationAllowed':True,'purpose':'pending','decisionEvidence':'unknown'}},
                        {'rights':{'evaluationAllowed':'true','purpose':'personal_noncommercial_evaluation','decisionEvidence':'fixture'}}]:
            with self.subTest(profile=profile),self.assertRaises(ValueError):require_transfer_rights(profile)
        self.assertIsNone(require_transfer_rights({'rights':{'evaluationAllowed':True,'purpose':'personal_noncommercial_evaluation','decisionEvidence':'owned synthetic unit fixture'}}))

    def test_worker_accepts_only_canonical_id_and_image_fields(self):
        c={'id':'nv-dish-1','inputFile':'/disk/input.jpg','inputSha256':'a'*64}
        self.assertEqual(validate_image_case(c),c)
        for bad in [dict(c,id='dish_1000000000'),dict(c,id='nv-dish-01'),dict(c,id='../escape'),
                    dict(c,inputFile='relative.jpg'),dict(c,inputSha256='bad'),dict(c,reference={'massG':123})]:
            with self.subTest(bad=bad),self.assertRaises(ValueError):validate_image_case(bad)

    def test_worker_failure_never_prints_raw_trace_or_private_path(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);spec=root/'spec.json'
            spec.write_text(json.dumps({'graphFile':str(root/'DO_NOT_LOG_PRIVATE_INPUT'),'graphSha256':'a'*64}))
            result=subprocess.run([sys.executable,'-m','tool.run_transfer_lens','--worker',str(spec)],text=True,capture_output=True)
            self.assertNotEqual(result.returncode,0)
            self.assertNotIn('DO_NOT_LOG_PRIVATE_INPUT',result.stderr)
            self.assertNotIn('Traceback',result.stderr)


if __name__=='__main__':unittest.main()
