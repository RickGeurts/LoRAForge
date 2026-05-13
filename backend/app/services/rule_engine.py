"""Generic, domain-agnostic rule engine for the Validator node.

A Validator owns a list of rule instances stored on the workflow node
itself (node.config.rules). Each instance picks a primitive from the
registry below and supplies the parameters the primitive needs. The
engine walks the list, evaluates each rule against the run state, and
returns structured pass/fail results that the executor surfaces in the
audit trail.

Primitives are intentionally text/value-shaped — they assert on whatever
upstream nodes have put into state by name. Domain semantics live in the
extractors that populate state, not here. That's the trade-off: the
engine generalises to any workflow (regulatory, document QA, data
quality, etc.) but cannot itself know what "MREL" or "subordinated"
mean — the workflow builder composes those meanings.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable

RuleStatus = str  # "pass" | "fail" | "error"


@dataclass(frozen=True)
class RuleResult:
    id: str
    name: str
    type: str
    status: RuleStatus
    reason: str
    target: str | None = None

    def as_dict(self) -> dict[str, str | None]:
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "target": self.target,
            "status": self.status,
            "reason": self.reason,
        }


# ---------- primitives ---------- #


def _coerce_text(value: Any) -> str:
    """Flatten any state value into a searchable string."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple)):
        return " ".join(_coerce_text(v) for v in value)
    if isinstance(value, dict):
        return " ".join(_coerce_text(v) for v in value.values())
    return str(value)


def _coerce_number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _coerce_list(value: Any) -> list[Any] | None:
    if isinstance(value, (list, tuple)):
        return list(value)
    if isinstance(value, dict):
        return list(value.values())
    return None


def _field_present(state: dict[str, Any], rule: dict) -> tuple[bool, str]:
    target = rule.get("target")
    value = state.get(target) if target else None
    if value is None:
        return False, f"{target!r} is missing from state"
    if isinstance(value, (str, list, tuple, dict)) and len(value) == 0:
        return False, f"{target!r} is empty"
    return True, f"{target!r} is present"


def _field_absent(state: dict[str, Any], rule: dict) -> tuple[bool, str]:
    ok, reason = _field_present(state, rule)
    if ok:
        return False, f"{rule.get('target')!r} is present but should be absent"
    return True, reason


def _text_contains(state: dict[str, Any], rule: dict) -> tuple[bool, str]:
    haystack = _coerce_text(state.get(rule.get("target")))
    needle = str(rule.get("value", ""))
    if not needle:
        return False, "value is empty"
    case = bool(rule.get("case_sensitive", False))
    hit = (needle in haystack) if case else (needle.lower() in haystack.lower())
    if hit:
        return True, f"found {needle!r} in {rule.get('target')!r}"
    return False, f"{needle!r} not found in {rule.get('target')!r}"


def _text_does_not_contain(state: dict[str, Any], rule: dict) -> tuple[bool, str]:
    ok, reason = _text_contains(state, rule)
    if ok:
        return False, reason.replace("found", "unexpectedly found")
    return True, reason.replace("not found in", "absent from")


def _regex_matches(state: dict[str, Any], rule: dict) -> tuple[bool, str]:
    pattern = str(rule.get("pattern", ""))
    if not pattern:
        return False, "pattern is empty"
    flags = 0 if rule.get("case_sensitive") else re.IGNORECASE
    try:
        compiled = re.compile(pattern, flags)
    except re.error as exc:
        return False, f"invalid regex: {exc}"
    haystack = _coerce_text(state.get(rule.get("target")))
    if compiled.search(haystack):
        return True, f"pattern matched in {rule.get('target')!r}"
    return False, f"pattern not matched in {rule.get('target')!r}"


def _value_equals(state: dict[str, Any], rule: dict) -> tuple[bool, str]:
    actual = state.get(rule.get("target"))
    expected = rule.get("value")
    if actual == expected:
        return True, f"{rule.get('target')!r} equals {expected!r}"
    return False, f"{rule.get('target')!r} is {actual!r}, expected {expected!r}"


def _value_in_set(state: dict[str, Any], rule: dict) -> tuple[bool, str]:
    actual = state.get(rule.get("target"))
    raw = rule.get("values", [])
    values = (
        [v.strip() for v in raw.split(",")]
        if isinstance(raw, str)
        else list(raw)
    )
    if actual in values:
        return True, f"{rule.get('target')!r} is in allowed set"
    return False, f"{rule.get('target')!r} ({actual!r}) is not in allowed set"


def _count_at_least(state: dict[str, Any], rule: dict) -> tuple[bool, str]:
    items = _coerce_list(state.get(rule.get("target")))
    if items is None:
        return False, f"{rule.get('target')!r} is not a list"
    bound = _coerce_number(rule.get("bound", 1)) or 0
    if len(items) >= bound:
        return True, f"{rule.get('target')!r} has {len(items)} item(s) ≥ {bound:.0f}"
    return False, f"{rule.get('target')!r} has {len(items)} item(s) < {bound:.0f}"


def _count_at_most(state: dict[str, Any], rule: dict) -> tuple[bool, str]:
    items = _coerce_list(state.get(rule.get("target")))
    if items is None:
        return False, f"{rule.get('target')!r} is not a list"
    bound = _coerce_number(rule.get("bound", 0)) or 0
    if len(items) <= bound:
        return True, f"{rule.get('target')!r} has {len(items)} item(s) ≤ {bound:.0f}"
    return False, f"{rule.get('target')!r} has {len(items)} item(s) > {bound:.0f}"


def _numeric_at_least(state: dict[str, Any], rule: dict) -> tuple[bool, str]:
    value = _coerce_number(state.get(rule.get("target")))
    if value is None:
        return False, f"{rule.get('target')!r} is not numeric"
    bound = _coerce_number(rule.get("bound", 0)) or 0
    if value >= bound:
        return True, f"{rule.get('target')!r} = {value:g} ≥ {bound:g}"
    return False, f"{rule.get('target')!r} = {value:g} < {bound:g}"


def _numeric_at_most(state: dict[str, Any], rule: dict) -> tuple[bool, str]:
    value = _coerce_number(state.get(rule.get("target")))
    if value is None:
        return False, f"{rule.get('target')!r} is not numeric"
    bound = _coerce_number(rule.get("bound", 0)) or 0
    if value <= bound:
        return True, f"{rule.get('target')!r} = {value:g} ≤ {bound:g}"
    return False, f"{rule.get('target')!r} = {value:g} > {bound:g}"


# ---------- primitive registry ---------- #


@dataclass(frozen=True)
class Primitive:
    type: str
    name: str
    description: str
    params: tuple[str, ...]
    impl: Callable[[dict[str, Any], dict], tuple[bool, str]]

    def as_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "name": self.name,
            "description": self.description,
            "params": list(self.params),
        }


PRIMITIVES: dict[str, Primitive] = {
    p.type: p
    for p in [
        Primitive(
            "field_present",
            "Field is present",
            "Passes when the named state field exists and is non-empty.",
            ("target",),
            _field_present,
        ),
        Primitive(
            "field_absent",
            "Field is absent",
            "Passes when the named state field is missing or empty.",
            ("target",),
            _field_absent,
        ),
        Primitive(
            "text_contains",
            "Text contains",
            "Passes when the state field's text contains the given substring.",
            ("target", "value", "case_sensitive"),
            _text_contains,
        ),
        Primitive(
            "text_does_not_contain",
            "Text does not contain",
            "Passes when the state field's text does NOT contain the substring.",
            ("target", "value", "case_sensitive"),
            _text_does_not_contain,
        ),
        Primitive(
            "regex_matches",
            "Regex matches",
            "Passes when the state field matches the regex pattern anywhere.",
            ("target", "pattern", "case_sensitive"),
            _regex_matches,
        ),
        Primitive(
            "value_equals",
            "Value equals",
            "Passes when the state field is exactly equal to a value.",
            ("target", "value"),
            _value_equals,
        ),
        Primitive(
            "value_in_set",
            "Value in set",
            "Passes when the state field is one of a comma-separated set.",
            ("target", "values"),
            _value_in_set,
        ),
        Primitive(
            "count_at_least",
            "Count at least",
            "Passes when the list-valued field has at least N items.",
            ("target", "bound"),
            _count_at_least,
        ),
        Primitive(
            "count_at_most",
            "Count at most",
            "Passes when the list-valued field has at most N items.",
            ("target", "bound"),
            _count_at_most,
        ),
        Primitive(
            "numeric_at_least",
            "Numeric at least",
            "Passes when the numeric field is at least the bound.",
            ("target", "bound"),
            _numeric_at_least,
        ),
        Primitive(
            "numeric_at_most",
            "Numeric at most",
            "Passes when the numeric field is at most the bound.",
            ("target", "bound"),
            _numeric_at_most,
        ),
    ]
}


# ---------- engine ---------- #


def evaluate(rules: list[dict], state: dict[str, Any]) -> list[RuleResult]:
    """Run each rule against state and collect typed results."""
    out: list[RuleResult] = []
    for i, rule in enumerate(rules):
        rule_type = str(rule.get("type", ""))
        primitive = PRIMITIVES.get(rule_type)
        rule_id = str(rule.get("id") or f"rule-{i + 1}")
        rule_name = str(rule.get("name") or primitive.name if primitive else rule_type)
        target = rule.get("target")
        if primitive is None:
            out.append(
                RuleResult(
                    id=rule_id,
                    name=rule_name,
                    type=rule_type or "(unknown)",
                    status="error",
                    reason=f"unknown rule type {rule_type!r}",
                    target=target,
                )
            )
            continue
        try:
            ok, reason = primitive.impl(state, rule)
        except Exception as exc:  # noqa: BLE001 — engine never crashes a run
            out.append(
                RuleResult(
                    id=rule_id,
                    name=rule_name,
                    type=rule_type,
                    status="error",
                    reason=f"rule errored: {exc}",
                    target=target,
                )
            )
            continue
        if not ok and rule.get("reason_on_fail"):
            reason = str(rule["reason_on_fail"])
        out.append(
            RuleResult(
                id=rule_id,
                name=rule_name,
                type=rule_type,
                status="pass" if ok else "fail",
                reason=reason,
                target=target,
            )
        )
    return out


def score(results: list[RuleResult]) -> float:
    """Pass-rate. Errors count as fail."""
    if not results:
        return 0.0
    passed = sum(1 for r in results if r.status == "pass")
    return round(passed / len(results), 3)


def summary_line(results: list[RuleResult]) -> str:
    if not results:
        return "No rules configured."
    passed = sum(1 for r in results if r.status == "pass")
    failed = [r.name for r in results if r.status == "fail"]
    errored = [r.name for r in results if r.status == "error"]
    parts = [f"{passed}/{len(results)} rules passed"]
    if failed:
        parts.append(f"failed: {', '.join(failed)}")
    if errored:
        parts.append(f"errored: {', '.join(errored)}")
    return ". ".join(parts) + "."
