#!/usr/bin/env python3
"""Fail closed on unreviewed Slither medium/high findings and source drift."""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

CONTRACTS = Path(__file__).resolve().parent.parent / "contracts"
BASELINE = CONTRACTS / "slither-reviewed.json"


def fingerprint(detector: dict) -> list[dict] | None:
    elements = detector.get("elements")
    if not isinstance(elements, list) or not elements:
        return None
    result = []
    for element in elements:
        if not isinstance(element, dict):
            return None
        mapping = element.get("source_mapping", {})
        path = mapping.get("filename_relative")
        if not isinstance(path, str):
            return None
        path = path.replace("\\", "/")
        if not path.startswith("src/") or ".." in path.split("/"):
            return None
        result.append({"type": element.get("type"), "name": element.get("name"), "path": path})
    return sorted(result, key=lambda item: (str(item["type"]), str(item["name"]), item["path"]))


def is_allowed(detector: dict, rules: list[dict]) -> bool:
    if detector.get("impact") != "Medium":
        return False  # Never allow high findings through a baseline.
    actual = fingerprint(detector)
    if actual is None:
        return False
    for rule in rules:
        expected = sorted(rule["elements"], key=lambda item: (str(item["type"]), str(item["name"]), item["path"]))
        if detector.get("check") != rule["check"] or actual != expected:
            continue
        hashes = rule["source_sha256"]
        if set(hashes) != {entry["path"] for entry in actual}:
            return False
        for path, expected_hash in hashes.items():
            source = (CONTRACTS / path).read_text(encoding="utf-8").replace("\r\n", "\n")
            if hashlib.sha256(source.encode()).hexdigest() != expected_hash:
                return False
        return True
    return False


def self_test(rules: list[dict]) -> None:
    for rule in rules:
        sample = {"check": rule["check"], "impact": "Medium", "elements": [
            {"type": entry["type"], "name": entry["name"], "source_mapping": {"filename_relative": entry["path"]}}
            for entry in rule["elements"]
        ]}
        assert is_allowed(sample, rules)
        assert not is_allowed({**sample, "impact": "High"}, rules)
        assert not is_allowed({**sample, "check": "arbitrary-send-eth"}, rules)
        changed = json.loads(json.dumps(sample))
        changed["elements"][0]["name"] += "_new"
        assert not is_allowed(changed, rules)
        wrong_hash = json.loads(json.dumps(rule))
        wrong_hash["source_sha256"] = {path: "0" * 64 for path in rule["source_sha256"]}
        assert not is_allowed(sample, [wrong_hash])
    print(f"Slither gate: {len(rules)} exact exceptions; new/high/source-drift checks pass.")


def main() -> int:
    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
    if baseline.get("schema_version") != 1:
        raise ValueError("Unsupported Slither review schema")
    rules = baseline["rules"]
    if sys.argv[1:] == ["--self-test"]:
        self_test(rules)
        return 0
    if len(sys.argv) != 2:
        print("usage: check-slither.py <report.json> OR --self-test", file=sys.stderr)
        return 2
    report = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    if report.get("success") is not True:
        print("Slither did not complete successfully", file=sys.stderr)
        return 1
    detectors = report.get("results", {}).get("detectors", [])
    blocked, allowed = [], []
    for detector in detectors:
        if str(detector.get("impact", "")).lower() not in {"medium", "high"}:
            continue
        (allowed if is_allowed(detector, rules) else blocked).append(detector)
    for detector in blocked:
        print(f'{detector["impact"]}: {detector["check"]}: {detector["description"]}', file=sys.stderr)
    print(f"Slither gate: {len(blocked)} unreviewed medium/high; {len(allowed)} exact source-pinned dispositions.")
    return 1 if blocked else 0


if __name__ == "__main__":
    raise SystemExit(main())
