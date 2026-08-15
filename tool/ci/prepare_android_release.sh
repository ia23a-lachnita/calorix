#!/usr/bin/env bash
# Fail-closed materializer for the eight Android release inputs.
# Subcommands: prepare --root <dir> | cleanup --root <dir> |
#              verify-fingerprint --expected <value> --actual <value>
set -euo pipefail

exec python3 - "$@" <<'PYEOF'
import base64
import json
import os
import plistlib
import re
import sys

REQUIRED_INPUTS = [
    "FIREBASE_OPTIONS_DART_BASE64",
    "GOOGLE_SERVICES_JSON_BASE64",
    "GOOGLE_SERVICE_INFO_PLIST_BASE64",
    "KEYSTORE_BASE64",
    "KEYSTORE_PASSWORD",
    "KEY_ALIAS",
    "KEY_PASSWORD",
    "RELEASE_CERT_SHA256",
]

B64_INPUTS = [
    "FIREBASE_OPTIONS_DART_BASE64",
    "GOOGLE_SERVICES_JSON_BASE64",
    "GOOGLE_SERVICE_INFO_PLIST_BASE64",
    "KEYSTORE_BASE64",
]

TEXT_ARTIFACT_INPUTS = [
    "FIREBASE_OPTIONS_DART_BASE64",
    "GOOGLE_SERVICES_JSON_BASE64",
    "GOOGLE_SERVICE_INFO_PLIST_BASE64",
]

PROPERTY_INPUTS = ["KEYSTORE_PASSWORD", "KEY_ALIAS", "KEY_PASSWORD"]

KEYSTORE_NAME = "release.jks"

ANDROID_PACKAGE_NAME = "com.calorix.calorix"
IOS_BUNDLE_ID = "com.calorix.calorix"

MARKER_WORDS = ("ci-placeholder", "placeholder", "changeme", "example")

DART_REQUIRED_FIELDS = ("apiKey", "appId", "messagingSenderId", "projectId")

# Fixed, owned output paths. cleanup() only ever removes these exact paths -
# never a directory scan or wildcard - so unrelated files are never touched.
MATERIALIZED_RELATIVE_PATHS = [
    "lib/core/firebase/firebase_options.dart",
    "android/app/google-services.json",
    "ios/Runner/GoogleService-Info.plist",
    "android/key.properties",
    f"android/app/{KEYSTORE_NAME}",
]


def get_arg(args, flag):
    if flag in args:
        idx = args.index(flag)
        if idx + 1 < len(args):
            return args[idx + 1]
    return None


def cleanup(root):
    for rel in MATERIALIZED_RELATIVE_PATHS:
        try:
            os.remove(os.path.join(root, rel))
        except FileNotFoundError:
            pass


def fail(errors, root):
    for message in errors:
        print(f"error: {message}", file=sys.stderr)
    cleanup(root)
    sys.exit(1)


def has_control_chars(value):
    return any(ord(ch) < 0x20 for ch in value)


def escape_property_value(value):
    out = []
    for ch in value:
        if ch in "\\:=#!":
            out.append("\\" + ch)
        else:
            out.append(ch)
    return "".join(out)


def normalize_fingerprint(value):
    if value is None:
        return None
    stripped = re.sub(r"[:\s]", "", value)
    upper = stripped.upper()
    if re.fullmatch(r"[0-9A-F]{64}", upper):
        return upper
    return None


def write_bytes(root, relative_path, data):
    full_path = os.path.join(root, relative_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "wb") as handle:
        handle.write(data)


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
    """Explicit regex helper matching quoted literal field assignments as
    they appear in generated FirebaseOptions Dart source, e.g. apiKey: '...'"""
    pattern = re.compile(r"%s\s*:\s*'([^']*)'" % re.escape(field))
    return pattern.findall(text)


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

    clients = data.get("client")
    matching_package_found = False
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
            if package_name != ANDROID_PACKAGE_NAME:
                continue
            matching_package_found = True
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

    if not matching_package_found:
        reasons.append(
            f"no client with android package {ANDROID_PACKAGE_NAME} was found"
        )
    elif not valid_current_key_found:
        if marker_current_key_found:
            reasons.append("placeholder value for client api_key.current_key")
        else:
            reasons.append("missing or blank client api_key.current_key")

    return reasons


def validate_plist(data_bytes):
    try:
        parsed = plistlib.loads(data_bytes)
    except Exception:
        return ["does not decode to a valid plist"]
    if not isinstance(parsed, dict):
        return ["plist root is not a dictionary"]

    reasons = []
    for field in ("API_KEY", "GOOGLE_APP_ID", "PROJECT_ID", "GCM_SENDER_ID"):
        value = parsed.get(field)
        if not isinstance(value, str) or not value:
            reasons.append(f"missing or blank {field}")
        elif _has_marker(value):
            reasons.append(f"placeholder value for {field}")

    bundle_id = parsed.get("BUNDLE_ID")
    if not isinstance(bundle_id, str) or not bundle_id:
        reasons.append("missing or blank BUNDLE_ID")
    elif bundle_id != IOS_BUNDLE_ID:
        reasons.append("BUNDLE_ID does not match the required application id")
    elif _has_marker(bundle_id):
        reasons.append("placeholder value for BUNDLE_ID")

    return reasons


def cmd_prepare(root):
    errors = []
    values = {}
    for name in REQUIRED_INPUTS:
        value = os.environ.get(name)
        if value is None or value == "":
            errors.append(f"{name} is required but missing or empty")
        else:
            values[name] = value
    if errors:
        fail(errors, root)

    decoded = {}
    for name in B64_INPUTS:
        try:
            decoded[name] = base64.b64decode(values[name], validate=True)
        except Exception:
            errors.append(f"{name} is not valid base64")
    if errors:
        fail(errors, root)

    text = {}
    for name in TEXT_ARTIFACT_INPUTS:
        text[name] = _strict_utf8_decode(name, decoded[name], errors)
    if errors:
        fail(errors, root)

    for reason in validate_dart(text["FIREBASE_OPTIONS_DART_BASE64"]):
        errors.append(f"FIREBASE_OPTIONS_DART_BASE64: {reason}")
    for reason in validate_google_services(text["GOOGLE_SERVICES_JSON_BASE64"]):
        errors.append(f"GOOGLE_SERVICES_JSON_BASE64: {reason}")
    for reason in validate_plist(decoded["GOOGLE_SERVICE_INFO_PLIST_BASE64"]):
        errors.append(f"GOOGLE_SERVICE_INFO_PLIST_BASE64: {reason}")

    keystore_bytes = decoded["KEYSTORE_BASE64"]
    if len(keystore_bytes) == 0:
        errors.append("KEYSTORE_BASE64 decodes to an empty keystore")
    if errors:
        fail(errors, root)

    for name in PROPERTY_INPUTS:
        if has_control_chars(values[name]):
            errors.append(
                f"{name} contains unsafe newline or control characters"
            )
    if errors:
        fail(errors, root)

    if normalize_fingerprint(values["RELEASE_CERT_SHA256"]) is None:
        errors.append(
            "RELEASE_CERT_SHA256 must be exactly 64 hexadecimal characters"
        )
    if errors:
        fail(errors, root)

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
        write_bytes(
            root,
            "ios/Runner/GoogleService-Info.plist",
            decoded["GOOGLE_SERVICE_INFO_PLIST_BASE64"],
        )
        write_bytes(root, f"android/app/{KEYSTORE_NAME}", keystore_bytes)

        properties = "\n".join(
            [
                f"storeFile={KEYSTORE_NAME}",
                f"storePassword={escape_property_value(values['KEYSTORE_PASSWORD'])}",
                f"keyAlias={escape_property_value(values['KEY_ALIAS'])}",
                f"keyPassword={escape_property_value(values['KEY_PASSWORD'])}",
            ]
        ) + "\n"
        write_bytes(root, "android/key.properties", properties.encode("utf-8"))
    except Exception as exc:  # pragma: no cover - defensive
        fail([f"failed to materialize release inputs: {type(exc).__name__}"], root)

    print("Prepared Android release inputs.")
    sys.exit(0)


def cmd_cleanup(root):
    cleanup(root)
    print("Cleaned up Android release inputs.")
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
        print("error: release certificate fingerprint mismatch", file=sys.stderr)
        sys.exit(1)

    print("Release certificate fingerprint verified.")
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
        cmd_prepare(os.path.abspath(root))
    elif command == "cleanup":
        root = get_arg(rest, "--root")
        if not root:
            print("error: --root is required", file=sys.stderr)
            sys.exit(2)
        cmd_cleanup(os.path.abspath(root))
    elif command == "verify-fingerprint":
        expected = get_arg(rest, "--expected")
        actual = get_arg(rest, "--actual")
        cmd_verify_fingerprint(expected, actual)
    else:
        print(f"error: unknown subcommand '{command}'", file=sys.stderr)
        sys.exit(2)


main()
PYEOF
