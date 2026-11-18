#!/usr/bin/env python3
"""Fail closed when the test APK contains extra ABIs or debug runtime assets."""
import argparse
from pathlib import Path
import sys
import zipfile


def validate_apk(path: Path) -> None:
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
    abis = {name.split('/')[1] for name in names
            if name.startswith('lib/') and not name.endswith('/')}
    unexpected = abis - {'arm64-v8a'}
    if unexpected:
        raise ValueError('Unexpected native ABI: ' + ', '.join(sorted(unexpected)))
    required = {'lib/arm64-v8a/libapp.so', 'lib/arm64-v8a/libflutter.so'}
    if not required.issubset(names):
        raise ValueError('Missing release runtime: arm64 AOT app and engine required')
    if any(name.endswith('kernel_blob.bin') for name in names):
        raise ValueError('JIT kernel must not be packaged in a release test APK')
    if any('VkLayer_khronos_validation' in name for name in names):
        raise ValueError('Vulkan validation layer must not be packaged in a release test APK')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('apk', type=Path)
    args = parser.parse_args()
    try:
        validate_apk(args.apk)
    except (OSError, zipfile.BadZipFile):
        print('Invalid APK archive', file=sys.stderr)
        return 1
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1
    print('Verified release APK: arm64-v8a only, AOT runtime present, no debug assets')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
