"""Deterministic regulatory rules for the Validator node.

MREL eligibility per BRRD/SRMR Article 45b boils down to four
checkable conditions. The rules here scan the structured clauses
produced by the Clause Extractor (type-tagged, source-anchored) and
return a per-rule pass/fail with the anchor that drove the verdict, so
the audit trail can cite *which* clause failed *which* rule.

Rules are pure functions of clause data — no AI, no external lookups.
That's the point: the regulator can re-derive the same verdict by hand.
"""
from __future__ import annotations

import datetime as _dt
import re
from dataclasses import dataclass
from typing import Iterable

RuleStatus = str  # "pass" | "fail" | "uncertain"


@dataclass(frozen=True)
class RuleResult:
    id: str
    name: str
    status: RuleStatus
    reason: str
    source_file: str | None = None
    source_anchor: str | None = None

    def as_dict(self) -> dict[str, str | None]:
        return {
            "id": self.id,
            "name": self.name,
            "status": self.status,
            "reason": self.reason,
            "sourceFile": self.source_file,
            "sourceAnchor": self.source_anchor,
        }


def _clauses_of(
    clauses: Iterable[dict], *types: str
) -> list[dict]:
    wanted = {t.lower() for t in types}
    return [c for c in clauses if str(c.get("type", "")).lower() in wanted]


def _join_text(clauses: Iterable[dict]) -> str:
    return " ".join(str(c.get("text", "")) for c in clauses)


def _anchor(clause: dict) -> tuple[str | None, str | None]:
    source = clause.get("sourceFile")
    section = clause.get("section")
    title = clause.get("title")
    if section and title:
        return source, f"{section} {title}"
    return source, section


def _check_subordination(clauses: list[dict]) -> RuleResult:
    """Pass if any clause indicates the instrument is subordinated.

    "Unsubordinated" or "senior preferred" is an explicit fail signal
    even when the word "subordinated" also appears further down.
    """
    pool = _clauses_of(clauses, "subordination", "ranking") or list(clauses)
    text = _join_text(pool).lower()
    if "unsubordinated" in text or "senior preferred" in text:
        offender = next(
            (
                c
                for c in pool
                if "unsubordinated" in str(c.get("text", "")).lower()
                or "senior preferred" in str(c.get("text", "")).lower()
            ),
            None,
        )
        src, anchor = _anchor(offender) if offender else (None, None)
        return RuleResult(
            id="subordination",
            name="Subordinated instrument",
            status="fail",
            reason="instrument is unsubordinated / senior preferred",
            source_file=src,
            source_anchor=anchor,
        )
    if re.search(r"\bsubordinated\b|\bjunior to\b|\bdeeply subordinated\b", text):
        winner = next(
            (
                c
                for c in pool
                if re.search(
                    r"\bsubordinated\b|\bjunior to\b|\bdeeply subordinated\b",
                    str(c.get("text", "")).lower(),
                )
            ),
            None,
        )
        src, anchor = _anchor(winner) if winner else (None, None)
        return RuleResult(
            id="subordination",
            name="Subordinated instrument",
            status="pass",
            reason="subordination clause found",
            source_file=src,
            source_anchor=anchor,
        )
    return RuleResult(
        id="subordination",
        name="Subordinated instrument",
        status="fail",
        reason="no subordination clause identified",
    )


def _check_unsecured(clauses: list[dict]) -> RuleResult:
    """Pass if the instrument is explicitly unsecured. Fail on secured/covered bonds."""
    pool = list(clauses)
    text = _join_text(pool).lower()
    if "covered bond" in text or re.search(
        r"(?<!un)secured obligations?", text
    ) or "cover pool" in text:
        offender = next(
            (
                c
                for c in pool
                if "covered bond" in str(c.get("text", "")).lower()
                or re.search(
                    r"(?<!un)secured obligations?",
                    str(c.get("text", "")).lower(),
                )
                or "cover pool" in str(c.get("text", "")).lower()
            ),
            None,
        )
        src, anchor = _anchor(offender) if offender else (None, None)
        return RuleResult(
            id="unsecured",
            name="Unsecured instrument",
            status="fail",
            reason="instrument is secured / covered",
            source_file=src,
            source_anchor=anchor,
        )
    if "unsecured" in text:
        winner = next(
            (
                c
                for c in pool
                if "unsecured" in str(c.get("text", "")).lower()
            ),
            None,
        )
        src, anchor = _anchor(winner) if winner else (None, None)
        return RuleResult(
            id="unsecured",
            name="Unsecured instrument",
            status="pass",
            reason="explicit unsecured statement found",
            source_file=src,
            source_anchor=anchor,
        )
    return RuleResult(
        id="unsecured",
        name="Unsecured instrument",
        status="uncertain",
        reason="no security/unsecured statement identified",
    )


def _check_maturity(
    clauses: list[dict], *, today: _dt.date | None = None
) -> RuleResult:
    """Pass if maturity > 1y or instrument is perpetual."""
    today = today or _dt.date.today()
    cutoff_year = today.year + 1
    pool = _clauses_of(clauses, "maturity")
    text = _join_text(pool).lower()
    if "perpetual" in text:
        winner = next(
            (
                c
                for c in pool
                if "perpetual" in str(c.get("text", "")).lower()
            ),
            None,
        )
        src, anchor = _anchor(winner) if winner else (None, None)
        return RuleResult(
            id="maturity",
            name="Effective maturity ≥ 1 year",
            status="pass",
            reason="perpetual instrument — no fixed maturity",
            source_file=src,
            source_anchor=anchor,
        )
    years = [int(m) for m in re.findall(r"\b(20\d{2})\b", text)]
    if years:
        max_year = max(years)
        winner = next(
            (
                c
                for c in pool
                if str(max_year) in str(c.get("text", ""))
            ),
            None,
        )
        src, anchor = _anchor(winner) if winner else (None, None)
        if max_year > cutoff_year:
            return RuleResult(
                id="maturity",
                name="Effective maturity ≥ 1 year",
                status="pass",
                reason=f"maturity year {max_year} > {cutoff_year}",
                source_file=src,
                source_anchor=anchor,
            )
        return RuleResult(
            id="maturity",
            name="Effective maturity ≥ 1 year",
            status="fail",
            reason=f"maturity year {max_year} ≤ {cutoff_year} (less than 1y from today)",
            source_file=src,
            source_anchor=anchor,
        )
    return RuleResult(
        id="maturity",
        name="Effective maturity ≥ 1 year",
        status="uncertain",
        reason="no maturity year identified",
    )


def _check_resolution_entity(clauses: list[dict]) -> RuleResult:
    """Pass if the issuer is the resolution entity of the group."""
    pool = _clauses_of(clauses, "issuer") or list(clauses)
    for clause in pool:
        text = str(clause.get("text", "")).lower()
        if "not the resolution entity" in text:
            src, anchor = _anchor(clause)
            return RuleResult(
                id="resolution_entity",
                name="Issued by resolution entity",
                status="fail",
                reason="issuer is explicitly NOT the resolution entity",
                source_file=src,
                source_anchor=anchor,
            )
        if "resolution entity" in text:
            src, anchor = _anchor(clause)
            return RuleResult(
                id="resolution_entity",
                name="Issued by resolution entity",
                status="pass",
                reason="issuer identified as resolution entity",
                source_file=src,
                source_anchor=anchor,
            )
    return RuleResult(
        id="resolution_entity",
        name="Issued by resolution entity",
        status="uncertain",
        reason="issuer clause does not mention resolution entity",
    )


def evaluate_mrel_rules(clauses: list[dict]) -> list[RuleResult]:
    """Run the four MREL eligibility checks against the extracted clauses."""
    return [
        _check_subordination(clauses),
        _check_unsecured(clauses),
        _check_maturity(clauses),
        _check_resolution_entity(clauses),
    ]


def score(results: list[RuleResult]) -> float:
    """Pass-rate. Uncertain counts as half (a regulator would re-check it)."""
    if not results:
        return 0.0
    weight = sum(
        1.0 if r.status == "pass" else 0.5 if r.status == "uncertain" else 0.0
        for r in results
    )
    return round(weight / len(results), 3)


def summary_line(results: list[RuleResult]) -> str:
    if not results:
        return "No rules evaluated."
    passed = [r.id for r in results if r.status == "pass"]
    failed = [r.id for r in results if r.status == "fail"]
    uncertain = [r.id for r in results if r.status == "uncertain"]
    parts = [f"{len(passed)}/{len(results)} rules passed"]
    if failed:
        parts.append(f"failed: {', '.join(failed)}")
    if uncertain:
        parts.append(f"uncertain: {', '.join(uncertain)}")
    return ". ".join(parts) + "."
