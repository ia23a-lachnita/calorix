#!/usr/bin/env python3
"""Immutable runtime evidence sidecar generation and independent validation.

Stdlib-only Python CLI with explicit write and validate commands.
write: receives explicit facts, computes apkSha256 from the APK path, emits
       staleBuildFingerprint: false. Missing parent directories of --output
       are created before the atomic tempfile+os.replace write.
validate: independently recomputes APK SHA-256 and compares caller-supplied
          actual values. Rejects missing/extra keys, invalid SHA/SHA-1
          formats, invalid UTC timestamp, stale flag not false, non-empty
          contract violations, malformed viewportDimensions, and mismatch,
          and missing APK. Expected input errors exit nonzero with a concise
          stderr message and never a raw traceback.
"""
import argparse
import hashlib
import json
import os
import sys
import tempfile
from datetime import datetime

REQUIRED_KEYS = frozenset([
    'sourceCommitSha',
    'sourceFingerprint',
    'apkSha256',
    'sdkVersion',
    'deviceModel',
    'viewportDimensions',
    'timestamp',
    'staleBuildFingerprint',
])


def sha256_hex(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def fail(message):
    print(message, file=sys.stderr)
    sys.exit(1)


def validate_hex_string(value, label, length):
    if not isinstance(value, str):
        fail(f'{label}: expected string, got {type(value).__name__}')
    if len(value) != length:
        fail(f'{label}: expected {length} hex chars, got {len(value)}')
    try:
        bytes.fromhex(value)
    except ValueError:
        fail(f'{label}: not valid hex: {value}')


def validate_sha1_hex(value, label):
    validate_hex_string(value, label, 40)


def validate_sha256_hex(value, label):
    validate_hex_string(value, label, 64)


def validate_nonempty_string(value, label):
    if not isinstance(value, str) or value == '':
        fail(f'{label}: expected non-empty string')


def parse_positive_int(value, label):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        fail(f'{label}: expected a positive integer, got {value}')
    if parsed <= 0:
        fail(f'{label}: expected a positive integer, got {value}')
    return parsed


def validate_utc_timestamp(value, label):
    if not isinstance(value, str):
        fail(f'{label}: expected string, got {type(value).__name__}')
    if not value.endswith('Z'):
        fail(f'{label}: must be UTC (end with Z): {value}')
    try:
        datetime.strptime(value, '%Y-%m-%dT%H:%M:%SZ')
    except ValueError:
        fail(f'{label}: invalid ISO 8601 format: {value}')


def validate_viewport_dimensions(value, label):
    if not isinstance(value, dict):
        fail(f'{label}: must be an object with width and height')
    if set(value.keys()) != {'width', 'height'}:
        fail(f'{label}: must contain exactly "width" and "height"')
    width = value['width']
    height = value['height']
    if (isinstance(width, bool) or not isinstance(width, int)
            or isinstance(height, bool) or not isinstance(height, int)):
        fail(f'{label}: width and height must be positive integers')
    if width <= 0 or height <= 0:
        fail(f'{label}: width and height must be positive integers')


def cmd_write(args):
    if not os.path.isfile(args.apk_path):
        fail(f'APK not found: {args.apk_path}')

    validate_sha1_hex(args.source_commit_sha, 'sourceCommitSha')
    validate_sha256_hex(args.source_fingerprint, 'sourceFingerprint')
    validate_utc_timestamp(args.timestamp, 'timestamp')
    validate_nonempty_string(args.sdk_version, 'sdkVersion')
    validate_nonempty_string(args.device_model, 'deviceModel')
    viewport_width = parse_positive_int(args.viewport_width, 'viewportWidth')
    viewport_height = parse_positive_int(args.viewport_height, 'viewportHeight')

    apk_hash = sha256_hex(args.apk_path)

    sidecar = {
        'sourceCommitSha': args.source_commit_sha,
        'sourceFingerprint': args.source_fingerprint,
        'apkSha256': apk_hash,
        'sdkVersion': args.sdk_version,
        'deviceModel': args.device_model,
        'viewportDimensions': {
            'width': viewport_width,
            'height': viewport_height,
        },
        'timestamp': args.timestamp,
        'staleBuildFingerprint': False,
    }

    output_path = args.output
    dir_name = os.path.dirname(output_path) or '.'
    os.makedirs(dir_name, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=dir_name, suffix='.tmp')
    try:
        with os.fdopen(fd, 'w') as tmp:
            json.dump(sidecar, tmp, sort_keys=True, indent=2)
            tmp.write('\n')
        os.replace(tmp_path, output_path)
    except BaseException:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise

    json.dump(sidecar, sys.stdout, sort_keys=True, indent=2)
    sys.stdout.write('\n')


def cmd_validate(args):
    if not os.path.isfile(args.sidecar):
        fail(f'Sidecar not found: {args.sidecar}')

    with open(args.sidecar, 'r') as f:
        try:
            sidecar = json.load(f)
        except json.JSONDecodeError as e:
            fail(f'Malformed JSON: {e}')

    if not isinstance(sidecar, dict):
        fail('Sidecar must be a JSON object')

    sidecar_keys = set(sidecar.keys())
    extra = sidecar_keys - REQUIRED_KEYS
    if extra:
        fail(f'Unexpected keys: {sorted(extra)}')

    missing = REQUIRED_KEYS - sidecar_keys
    if missing:
        fail(f'Missing keys: {sorted(missing)}')

    validate_sha1_hex(sidecar['sourceCommitSha'], 'sourceCommitSha')
    validate_sha256_hex(sidecar['sourceFingerprint'], 'sourceFingerprint')
    validate_sha256_hex(sidecar['apkSha256'], 'apkSha256')
    validate_utc_timestamp(sidecar['timestamp'], 'timestamp')
    validate_nonempty_string(sidecar['sdkVersion'], 'sdkVersion')
    validate_nonempty_string(sidecar['deviceModel'], 'deviceModel')
    validate_viewport_dimensions(sidecar['viewportDimensions'],
                                 'viewportDimensions')

    if sidecar['staleBuildFingerprint'] is not False:
        fail(f'staleBuildFingerprint must be false, '
             f'got {sidecar["staleBuildFingerprint"]}')

    if not os.path.isfile(args.apk_path):
        fail(f'APK not found: {args.apk_path}')

    actual_apk_hash = sha256_hex(args.apk_path)
    if sidecar['apkSha256'] != actual_apk_hash:
        fail(f'apkSha256 mismatch: sidecar={sidecar["apkSha256"]} '
             f'actual={actual_apk_hash}')

    if sidecar['sourceCommitSha'] != args.actual_source_commit_sha:
        fail(f'sourceCommitSha mismatch: sidecar={sidecar["sourceCommitSha"]} '
             f'actual={args.actual_source_commit_sha}')

    if sidecar['sourceFingerprint'] != args.actual_source_fingerprint:
        fail(f'sourceFingerprint mismatch: '
             f'sidecar={sidecar["sourceFingerprint"]} '
             f'actual={args.actual_source_fingerprint}')

    if sidecar['sdkVersion'] != args.actual_sdk_version:
        fail(f'sdkVersion mismatch: sidecar={sidecar["sdkVersion"]} '
             f'actual={args.actual_sdk_version}')

    if sidecar['deviceModel'] != args.actual_device_model:
        fail(f'deviceModel mismatch: sidecar={sidecar["deviceModel"]} '
             f'actual={args.actual_device_model}')

    expected_vp = sidecar['viewportDimensions']
    actual_width = parse_positive_int(args.actual_viewport_width,
                                      'actualViewportWidth')
    actual_height = parse_positive_int(args.actual_viewport_height,
                                       'actualViewportHeight')
    if expected_vp['width'] != actual_width:
        fail(f'viewport width mismatch: sidecar={expected_vp["width"]} '
             f'actual={actual_width}')
    if expected_vp['height'] != actual_height:
        fail(f'viewport height mismatch: sidecar={expected_vp["height"]} '
             f'actual={actual_height}')


def main():
    parser = argparse.ArgumentParser(
        description='Immutable runtime evidence sidecar tool')
    sub = parser.add_subparsers(dest='command', required=True)

    w = sub.add_parser('write', help='Generate a sidecar JSON file')
    w.add_argument('--source-commit-sha', required=True)
    w.add_argument('--source-fingerprint', required=True)
    w.add_argument('--sdk-version', required=True)
    w.add_argument('--device-model', required=True)
    w.add_argument('--viewport-width', required=True)
    w.add_argument('--viewport-height', required=True)
    w.add_argument('--timestamp', required=True)
    w.add_argument('--apk-path', required=True)
    w.add_argument('--output', required=True)
    w.set_defaults(func=cmd_write)

    v = sub.add_parser('validate', help='Validate a sidecar against facts')
    v.add_argument('--sidecar', required=True)
    v.add_argument('--actual-source-commit-sha', required=True)
    v.add_argument('--actual-source-fingerprint', required=True)
    v.add_argument('--actual-sdk-version', required=True)
    v.add_argument('--actual-device-model', required=True)
    v.add_argument('--actual-viewport-width', required=True)
    v.add_argument('--actual-viewport-height', required=True)
    v.add_argument('--apk-path', required=True)
    v.set_defaults(func=cmd_validate)

    args = parser.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()