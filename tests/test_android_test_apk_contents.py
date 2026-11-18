"""Exercise the CI APK guard against real ZIP containers."""
import pathlib
import subprocess
import sys
import tempfile
import unittest
import zipfile

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / 'tool/ci/verify_android_test_apk_contents.py'
BASE = ['lib/arm64-v8a/libapp.so', 'lib/arm64-v8a/libflutter.so']


class TestAndroidTestApkContents(unittest.TestCase):
    def check_archive(self, names):
        with tempfile.TemporaryDirectory() as root:
            apk = pathlib.Path(root) / 'test.apk'
            with zipfile.ZipFile(apk, 'w') as archive:
                for name in names:
                    archive.writestr(name, b'fixture native library')
            return subprocess.run([sys.executable, str(SCRIPT), str(apk)], capture_output=True, text=True)

    def test_arm64_aot_package_is_accepted(self):
        result = self.check_archive(BASE + ['lib/arm64-v8a/libplugin.so', 'assets/flutter_assets/AssetManifest.bin'])
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_other_native_architectures_are_rejected(self):
        for abi in ['armeabi-v7a', 'x86_64', 'x86']:
            with self.subTest(abi=abi):
                result = self.check_archive(BASE + [f'lib/{abi}/libplugin.so'])
                self.assertEqual(result.returncode, 1)
                self.assertIn('Unexpected native ABI', result.stderr)

    def test_missing_aot_or_engine_is_rejected(self):
        for missing in BASE:
            with self.subTest(missing=missing):
                result = self.check_archive([name for name in BASE if name != missing])
                self.assertEqual(result.returncode, 1)
                self.assertIn('Missing release runtime', result.stderr)

    def test_jit_kernel_is_rejected(self):
        result = self.check_archive(BASE + ['assets/flutter_assets/kernel_blob.bin'])
        self.assertEqual(result.returncode, 1)
        self.assertIn('JIT kernel', result.stderr)

    def test_vulkan_validation_layer_is_rejected(self):
        result = self.check_archive(BASE + ['lib/arm64-v8a/libVkLayer_khronos_validation.so'])
        self.assertEqual(result.returncode, 1)
        self.assertIn('Vulkan validation layer', result.stderr)

    def test_invalid_archive_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            apk = pathlib.Path(root) / 'broken.apk'
            apk.write_bytes(b'not an APK')
            result = subprocess.run([sys.executable, str(SCRIPT), str(apk)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertIn('Invalid APK archive', result.stderr)
