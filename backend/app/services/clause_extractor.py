"""Deterministic prospectus clause extractor.

Splits a prospectus on `§<number>` section markers and classifies each
section by keyword. Output is structured (section id, type, text) so
downstream nodes can audit which clause drove a decision — the
free-form LLM output it replaces was not source-anchored.

Hybrid by design: deterministic split + keyword classify is fast,
reproducible, and citable. The AI MREL classifier downstream still
classifies eligibility per clause — we only take the *extraction* step
out of the LLM's hands.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

_SECTION_PATTERN = re.compile(
    r"§\s*(?P<section>\d+(?:\.\d+)*)\s+(?P<title>[^:\n]+?):\s*(?P<body>.+?)"
    r"(?=\n§\s*\d+(?:\.\d+)*\s+[^:\n]+?:|\Z)",
    re.DOTALL,
)

# Keyword -> clause type. First match wins, order matters: "secured" should
# beat "unsecured" -> security only if the word is exactly "secured" (we
# match unsecured first, then secured).
_TYPE_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("subordination", ("subordinated", "subordination", "junior to", "senior non-preferred", "snp", "at1", "tier 2")),
    ("security", ("unsecured", "secured", "cover pool", "covered bond", "collateral")),
    ("ranking", ("pari passu", "rank pari", "ranks senior", "ranks junior", "ranking")),
    ("maturity", ("mature", "maturity", "due ", "extendible maturity")),
    ("call_option", ("redemption", "redeem", "call option", "regulatory event", "reset date")),
    ("governing_law", ("governing law", "english law", "luxembourg law", "german law", "french law", "irish law")),
    ("issuer", ("resolution entity", "issuer is", "issuer:", "wholly-owned subsidiary")),
)


@dataclass(frozen=True)
class Clause:
    section: str
    title: str
    type: str
    text: str
    source_file: str | None = None

    def as_dict(self) -> dict[str, str | None]:
        return {
            "section": f"§{self.section}",
            "title": self.title,
            "type": self.type,
            "text": self.text,
            "sourceFile": self.source_file,
        }

    def source_anchor(self) -> str:
        anchor = f"§{self.section} {self.title}"
        if self.source_file:
            return f"{self.source_file} {anchor}"
        return anchor


def _classify(text: str, title: str) -> str:
    haystack = f"{title} {text}".lower()
    for clause_type, keywords in _TYPE_KEYWORDS:
        if any(k in haystack for k in keywords):
            return clause_type
    return "other"


def extract_clauses(prospectus_text: str) -> list[Clause]:
    """Return clauses in document order. Empty list if no § markers found."""
    if not prospectus_text:
        return []
    out: list[Clause] = []
    for match in _SECTION_PATTERN.finditer(prospectus_text):
        section = match.group("section").strip()
        title = match.group("title").strip()
        body = " ".join(match.group("body").split())
        out.append(
            Clause(
                section=section,
                title=title,
                type=_classify(body, title),
                text=body,
            )
        )
    return out


def render_for_prompt(clauses: list[Clause]) -> str:
    """One clause per line, formatted for an AI classifier prompt."""
    def _line(c: Clause) -> str:
        prefix = f"{c.source_file} " if c.source_file else ""
        return f"- {prefix}§{c.section} {c.title} [{c.type}]: {c.text}"

    return "\n".join(_line(c) for c in clauses)


def summary_line(clauses: list[Clause]) -> str:
    """One-line human summary for the run trace."""
    if not clauses:
        return "No § sections found — document text may be unstructured."
    by_type: dict[str, list[str]] = {}
    for c in clauses:
        by_type.setdefault(c.type, []).append(f"§{c.section}")
    parts = [f"{t} ({', '.join(sections)})" for t, sections in by_type.items()]
    return f"Extracted {len(clauses)} clauses: " + "; ".join(parts) + "."
