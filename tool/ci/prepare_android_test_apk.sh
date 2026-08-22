#!/usr/bin/env bash
# Fail-closed materializer for the four intermediate Android test-APK inputs.
# Subcommands: prepare --root <dir> [--home <dir>] |
#              cleanup --root <dir> [--home <dir>] |
#              verify-fingerprint --expected <value> --actual <value>
set -euo pipefail

export KEYTOOL_BIN="${KEYTOOL_BIN:-keytool}"

exec python3 - "$@" <<'PYEOF'
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

REQUIRED_INPUTS = [
    "FIREBASE_OPTIONS_DART_BASE64",
    "GOOGLE_SERVICES_JSON_BASE64",
    "TEST_DEBUG_KEYSTORE_BASE64",
    "TEST_DEBUG_CERT_SHA256",
]

B64_INPUTS = [
    "FIREBASE_OPTIONS_DART_BASE64",
    "GOOGLE_SERVICES_JSON_BASE64",
    "TEST_DEBUG_KEYSTORE_BASE64",
]

TEXT_ARTIFACT_INPUTS = [
    "FIREBASE_OPTIONS_DART_BASE64",
    "GOOGLE_SERVICES_JSON_BASE64",
]

PROJECT_ID = "calorix-xurschnell"
ANDROID_PACKAGE = "com.calorix.calorix"
ANDROID_APP_ID = "1:85048284883:android:d9ac439353e922ddf8a626"

MARKER_WORDS = ("ci-placeholder", "placeholder", "changeme", "example")

DART_REQUIRED_FIELDS = ("apiKey", "appId", "messagingSenderId", "projectId")

# Fixed, owned output paths under --root. cleanup() only ever removes these
# exact paths - never a directory scan or wildcard - so unrelated files are
# never touched.
MATERIALIZED_ROOT_PATHS = [
    "lib/core/firebase/firebase_options.dart",
    "android/app/google-services.json",
]


def get_arg(args, flag):
    if flag in args:
        idx = args.index(flag)
        if idx + 1 < len(args):
            return args[idx + 1]
    return None


def resolve_home(home):
    if home:
        return home
    return os.environ.get("HOME", "/tmp")


def debug_keystore_path(home):
    return os.path.join(resolve_home(home), ".android", "debug.keystore")


def cleanup(root, home):
    for rel in MATERIALIZED_ROOT_PATHS:
        try:
            os.remove(os.path.join(root, rel))
        except FileNotFoundError:
            pass
    try:
        os.remove(debug_keystore_path(home))
    except FileNotFoundError:
        pass


def fail(errors, root, home):
    for message in errors:
        print(f"error: {message}", file=sys.stderr)
    cleanup(root, home)
    sys.exit(1)


def write_bytes(root, relative_path, data):
    full_path = os.path.join(root, relative_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "wb") as handle:
        handle.write(data)


def normalize_fingerprint(value):
    if value is None:
        return None
    stripped = re.sub(r"[:\s]", "", value)
    upper = stripped.upper()
    if re.fullmatch(r"[0-9A-F]{64}", upper):
        return upper
    return None


def _has_marker(value):
    lowered = value.lower()
    return any(marker in lowered for marker in MARKER_WORDS)


def _strict_utf8_decode(name, data, errors):
    """Decode a Firebase text artifact with strict UTF-8. On failure this
    records only the associated env var name and a generic reason - never
    the offending bytes or any partially decoded content."""
    try:
        return data.decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        errors.append(f"{name} does not decode as valid UTF-8")
        return None


def _dart_field_values(text, field):
    pattern = re.compile(r"%s\s*:\s*'([^']*)'" % re.escape(field))
    return pattern.findall(text)


def _dart_android_block(text):
    match = re.search(r"android\s*=\s*FirebaseOptions\(([^)]*)\)", text)
    return match.group(1) if match else None


def _dart_android_fields(text):
    block = _dart_android_block(text)
    if block is None:
        return {}
    fields = {}
    for field in DART_REQUIRED_FIELDS:
        values = _dart_field_values(block, field)
        if values:
            fields[field] = values[0]
    return fields


def validate_dart(text):
    reasons = []
    if "DefaultFirebaseOptions" not in text:
        reasons.append("missing DefaultFirebaseOptions")
    if "FirebaseOptions(" not in text:
        reasons.append("missing FirebaseOptions(")
    if reasons:
        return reasons

    for field in DART_REQUIRED_FIELDS:
        values = _dart_field_values(text, field)
        if not values:
            reasons.append(f"missing {field} assignment")
            continue
        for value in values:
            if not value:
                reasons.append(f"blank {field} assignment")
                break
            if _has_marker(value):
                reasons.append(f"placeholder value for {field}")
                break
    return reasons


def validate_google_services(text):
    reasons = []
    try:
        data = json.loads(text)
    except Exception:
        return ["does not decode to valid JSON"]
    if not isinstance(data, dict):
        return ["does not decode to a JSON object"]

    project_info = data.get("project_info")
    project_id = (
        project_info.get("project_id") if isinstance(project_info, dict) else None
    )
    if not isinstance(project_id, str) or not project_id:
        reasons.append("missing or blank project_info.project_id")
    elif _has_marker(project_id):
        reasons.append("placeholder value for project_info.project_id")
    elif project_id != PROJECT_ID:
        reasons.append(f"project_info.project_id must be {PROJECT_ID}")

    clients = data.get("client")
    matching_client_found = False
    app_id_match_found = False
    valid_current_key_found = False
    marker_current_key_found = False
    if isinstance(clients, list):
        for client in clients:
            if not isinstance(client, dict):
                continue
            client_info = client.get("client_info")
            android_info = (
                client_info.get("android_client_info")
                if isinstance(client_info, dict)
                else None
            )
            package_name = (
                android_info.get("package_name")
                if isinstance(android_info, dict)
                else None
            )
            if package_name != ANDROID_PACKAGE:
                continue
            matching_client_found = True
            app_id = (
                client_info.get("mobilesdk_app_id")
                if isinstance(client_info, dict)
                else None
            )
            if app_id != ANDROID_APP_ID:
                continue
            app_id_match_found = True
            api_keys = client.get("api_key")
            if isinstance(api_keys, list):
                for entry in api_keys:
                    if not isinstance(entry, dict):
                        continue
                    current_key = entry.get("current_key")
                    if isinstance(current_key, str) and current_key:
                        if _has_marker(current_key):
                            marker_current_key_found = True
                        else:
                            valid_current_key_found = True

    if not matching_client_found:
        reasons.append(
            f"no client with android package {ANDROID_PACKAGE} was found"
        )
    elif not app_id_match_found:
        reasons.append(f"client android app id must be {ANDROID_APP_ID}")
    elif not valid_current_key_found:
        if marker_current_key_found:
            reasons.append("placeholder value for client api_key.current_key")
        else:
            reasons.append("missing or blank client api_key.current_key")

    return reasons


def validate_cross_match(dart_text, json_text):
    """Cross-checks the Dart `android` FirebaseOptions block against the
    matching google-services.json client so the two inputs cannot silently
    describe two different Firebase apps."""
    try:
        data = json.loads(json_text)
    except Exception:
        return []
    if not isinstance(data, dict):
        return []

    android_fields = _dart_android_fields(dart_text)

    project_info = data.get("project_info")
    json_project_id = (
        project_info.get("project_id") if isinstance(project_info, dict) else None
    )
    json_sender_id = (
        project_info.get("project_number")
        if isinstance(project_info, dict)
        else None
    )

    json_app_id = None
    json_api_key = None
    clients = data.get("client")
    if isinstance(clients, list):
        for client in clients:
            if not isinstance(client, dict):
                continue
            client_info = client.get("client_info")
            android_info = (
                client_info.get("android_client_info")
                if isinstance(client_info, dict)
                else None
            )
            package_name = (
                android_info.get("package_name")
                if isinstance(android_info, dict)
                else None
            )
            if package_name != ANDROID_PACKAGE:
                continue
            json_app_id = (
                client_info.get("mobilesdk_app_id")
                if isinstance(client_info, dict)
                else None
            )
            api_keys = client.get("api_key")
            if isinstance(api_keys, list) and api_keys:
                first = api_keys[0]
                if isinstance(first, dict):
                    json_api_key = first.get("current_key")
            break

    checks = [
        ("apiKey", android_fields.get("apiKey"), json_api_key),
        ("appId", android_fields.get("appId"), json_app_id),
        ("projectId", android_fields.get("projectId"), json_project_id),
        ("messagingSenderId", android_fields.get("messagingSenderId"), json_sender_id),
    ]
    reasons = []
    for field, dart_value, json_value in checks:
        if dart_value is not None and json_value is not None and dart_value != json_value:
            reasons.append(
                f"android {field} does not match between "
                "FIREBASE_OPTIONS_DART_BASE64 and GOOGLE_SERVICES_JSON_BASE64"
            )
    return reasons


def validate_keystore(keystore_bytes, errors):
    if len(keystore_bytes) == 0:
        errors.append("TEST_DEBUG_KEYSTORE_BASE64 decodes to an empty keystore")
        return

    keytool_bin = os.environ["KEYTOOL_BIN"]
    staging_dir = tempfile.mkdtemp(prefix="test-debug-keystore-")
    try:
        staged_path = os.path.join(staging_dir, "debug.keystore")
        with open(staged_path, "wb") as handle:
            handle.write(keystore_bytes)
        os.chmod(staged_path, 0o600)
        try:
            result = subprocess.run(
                [
                    keytool_bin,
                    "-list",
                    "-keystore",
                    staged_path,
                    "-storepass",
                    "android",
                    "-alias",
                    "androiddebugkey",
                ],
                capture_output=True,
            )
        except FileNotFoundError:
            errors.append(
                f"TEST_DEBUG_KEYSTORE_BASE64 could not be validated: "
                f"{keytool_bin} was not found"
            )
            return
        if result.returncode != 0:
            errors.append(
                "TEST_DEBUG_KEYSTORE_BASE64 failed keytool validation "
                "(invalid alias, storepass, or keystore format)"
            )
    finally:
        shutil.rmtree(staging_dir, ignore_errors=True)


def cmd_prepare(root, home):
    # Idempotent start-of-run cleanup: never let a previous attempt's
    # materialized files mask or contaminate this attempt's validation.
    cleanup(root, home)

    errors = []
    values = {}
    for name in REQUIRED_INPUTS:
        value = os.environ.get(name)
        if value is None or value == "":
            errors.append(f"{name} is required but missing or empty")
        else:
            values[name] = value
    if errors:
        fail(errors, root, home)

    decoded = {}
    for name in B64_INPUTS:
        try:
            decoded[name] = base64.b64decode(values[name], validate=True)
        except Exception:
            errors.append(f"{name} is not valid base64")
    if errors:
        fail(errors, root, home)

    text = {}
    for name in TEXT_ARTIFACT_INPUTS:
        text[name] = _strict_utf8_decode(name, decoded[name], errors)
    if errors:
        fail(errors, root, home)

    for reason in validate_dart(text["FIREBASE_OPTIONS_DART_BASE64"]):
        errors.append(f"FIREBASE_OPTIONS_DART_BASE64: {reason}")
    if errors:
        fail(errors, root, home)

    for reason in validate_google_services(text["GOOGLE_SERVICES_JSON_BASE64"]):
        errors.append(f"GOOGLE_SERVICES_JSON_BASE64: {reason}")
    if errors:
        fail(errors, root, home)

    for reason in validate_cross_match(
        text["FIREBASE_OPTIONS_DART_BASE64"], text["GOOGLE_SERVICES_JSON_BASE64"]
    ):
        errors.append(reason)
    if errors:
        fail(errors, root, home)

    if normalize_fingerprint(values["TEST_DEBUG_CERT_SHA256"]) is None:
        errors.append(
            "TEST_DEBUG_CERT_SHA256 must be exactly 64 hexadecimal characters"
        )
    if errors:
        fail(errors, root, home)

    validate_keystore(decoded["TEST_DEBUG_KEYSTORE_BASE64"], errors)
    if errors:
        fail(errors, root, home)

    try:
        write_bytes(
            root,
            "lib/core/firebase/firebase_options.dart",
            decoded["FIREBASE_OPTIONS_DART_BASE64"],
        )
        write_bytes(
            root,
            "android/app/google-services.json",
            decoded["GOOGLE_SERVICES_JSON_BASE64"],
        )
        keystore_path = debug_keystore_path(home)
        os.makedirs(os.path.dirname(keystore_path), exist_ok=True)
        with open(keystore_path, "wb") as handle:
            handle.write(decoded["TEST_DEBUG_KEYSTORE_BASE64"])
        os.chmod(keystore_path, 0o600)
    except Exception as exc:  # pragma: no cover - defensive
        fail(
            [f"failed to materialize test APK inputs: {type(exc).__name__}"],
            root,
            home,
        )

    print("Prepared Android test APK inputs.")
    sys.exit(0)


def cmd_cleanup(root, home):
    cleanup(root, home)
    print("Cleaned up Android test APK inputs.")
    sys.exit(0)


def cmd_verify_fingerprint(expected, actual):
    normalized_expected = normalize_fingerprint(expected)
    normalized_actual = normalize_fingerprint(actual)

    errors = []
    if normalized_expected is None:
        errors.append(
            "expected fingerprint is not exactly 64 hexadecimal characters "
            "after normalization"
        )
    if normalized_actual is None:
        errors.append(
            "actual fingerprint is not exactly 64 hexadecimal characters "
            "after normalization"
        )
    if errors:
        for message in errors:
            print(f"error: {message}", file=sys.stderr)
        sys.exit(1)

    if normalized_expected != normalized_actual:
        print("error: test debug certificate fingerprint mismatch", file=sys.stderr)
        sys.exit(1)

    print("Test debug certificate fingerprint verified.")
    sys.exit(0)


def main():
    argv = sys.argv[1:]
    if not argv:
        print("error: a subcommand is required", file=sys.stderr)
        sys.exit(2)

    command = argv[0]
    rest = argv[1:]

    if command == "prepare":
        root = get_arg(rest, "--root")
        if not root:
            print("error: --root is required", file=sys.stderr)
            sys.exit(2)
        home = get_arg(rest, "--home")
        cmd_prepare(os.path.abspath(root), home)
    elif command == "cleanup":
        root = get_arg(rest, "--root")
        if not root:
            print("error: --root is required", file=sys.stderr)
            sys.exit(2)
        home = get_arg(rest, "--home")
        cmd_cleanup(os.path.abspath(root), home)
    elif command == "verify-fingerprint":
        expected = get_arg(rest, "--expected")
        actual = get_arg(rest, "--actual")
        cmd_verify_fingerprint(expected, actual)
    else:
        print(f"error: unknown subcommand '{command}'", file=sys.stderr)
        sys.exit(2)


main()
PYEOF
