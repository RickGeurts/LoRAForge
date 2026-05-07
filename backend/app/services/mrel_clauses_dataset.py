"""Synthetic-but-realistic MREL clause dataset.

Hand-written archetypes are cross-producted with maturities, call options,
and governing laws to yield ~150 distinct rows. Eligibility labels follow
the MREL criteria spelled out in BRRD/SRMR Article 45b: subordinated to
ordinary unsecured, unsecured, effective maturity (to first call) ≥ 1 year,
and not issued by a subsidiary acting outside the resolution entity.

The generator is fully deterministic so reviewers can reproduce a row
exactly from its `rowId` if they need to. No RNG, no timestamps, no hash
of system state.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class _CallOption:
    id: str
    description: str
    effective_maturity_offset: float  # years subtracted from stated maturity


_NO_CALL = _CallOption(
    id="none",
    description="",
    effective_maturity_offset=0.0,
)
_SHORT_CALL = _CallOption(
    id="issuer_call_short",
    description=(
        " The Issuer may at its option redeem the Notes in whole at par on "
        "the First Call Date, falling six months after the Issue Date."
    ),
    effective_maturity_offset=99.0,  # neutralises stated maturity
)
_REG_CALL_5Y = _CallOption(
    id="regulatory_call_5y",
    description=(
        " The Issuer may redeem the Notes in whole following a Regulatory "
        "Event after the Reset Date, being five years after issuance."
    ),
    effective_maturity_offset=0.0,  # 5y is well past the 1y threshold
)
_REG_CALL_10Y = _CallOption(
    id="regulatory_call_10y",
    description=(
        " The Notes are redeemable at the Issuer's option following a Tax "
        "or Regulatory Event after ten years from the Issue Date."
    ),
    effective_maturity_offset=0.0,
)
_LONG_CALL = _CallOption(
    id="issuer_call_long",
    description=(
        " The Notes may be called at par by the Issuer on any Reset Date "
        "after the seventh anniversary of issuance."
    ),
    effective_maturity_offset=0.0,
)


@dataclass(frozen=True)
class _Archetype:
    label: str  # human instrument name
    subordination: str
    secured: bool
    maturities: tuple[float, ...]
    call_options: tuple[_CallOption, ...]
    excerpts: tuple[str, ...]
    clause_refs: tuple[str, ...]
    issuer_at_resolution_entity: bool = True


_ARCHETYPES: tuple[_Archetype, ...] = (
    _Archetype(
        label="Subordinated Tier 2 notes",
        subordination="subordinated",
        secured=False,
        maturities=(5.0, 7.0, 10.0, 12.0),
        call_options=(_NO_CALL, _REG_CALL_5Y, _SHORT_CALL),
        excerpts=(
            "The Notes constitute direct, unsecured and subordinated obligations "
            "of the Issuer ranking pari passu among themselves and behind the "
            "claims of all senior creditors.",
            "These Subordinated Notes will, in the event of liquidation, "
            "dissolution or winding-up of the Issuer, rank junior to all senior "
            "creditors of the Issuer.",
            "The obligations of the Issuer under the Notes are subordinated and "
            "rank junior in right of payment to all senior obligations of the "
            "Issuer.",
        ),
        clause_refs=(
            "§4.2 Subordination",
            "§4.3 Subordination on insolvency",
            "§5.1 Status",
        ),
    ),
    _Archetype(
        label="Senior preferred notes",
        subordination="senior_preferred",
        secured=False,
        maturities=(3.0, 5.0, 7.0),
        call_options=(_NO_CALL, _SHORT_CALL),
        excerpts=(
            "The Notes constitute direct, unsecured and unsubordinated "
            "obligations of the Issuer ranking pari passu with all other "
            "unsecured and unsubordinated obligations.",
            "Senior unsecured obligations of the Issuer ranking pari passu "
            "with all other senior unsecured liabilities.",
            "The Notes will rank in priority to any subordinated indebtedness "
            "of the Issuer and pari passu with all other senior unsecured debt.",
        ),
        clause_refs=("§3.1 Status", "§3.2 Ranking"),
    ),
    _Archetype(
        label="Senior non-preferred notes",
        subordination="senior_non_preferred",
        secured=False,
        maturities=(4.0, 6.0, 8.0, 10.0),
        call_options=(_NO_CALL, _LONG_CALL, _SHORT_CALL),
        excerpts=(
            "Upon insolvency of the Issuer, the Notes shall rank junior to "
            "senior preferred liabilities and senior to subordinated "
            "obligations.",
            "The Notes are senior non-preferred obligations: junior to senior "
            "preferred debt but senior to Tier 2 capital instruments.",
            "These Notes constitute non-preferred senior obligations subject "
            "to statutory subordination on resolution.",
        ),
        clause_refs=(
            "§3.2 Subordination on insolvency",
            "§3.3 Statutory subordination",
            "§3.4 Issuer call",
        ),
    ),
    _Archetype(
        label="Additional Tier 1 capital",
        subordination="deeply_subordinated",
        secured=False,
        maturities=(99.0,),  # perpetual
        call_options=(_REG_CALL_5Y, _NO_CALL),
        excerpts=(
            "The Notes are perpetual and contain a contractual write-down "
            "feature triggered upon the Issuer's CET1 ratio falling below "
            "5.125%.",
            "These deeply subordinated AT1 instruments are perpetual and "
            "include discretionary cancellation of distributions.",
            "The Notes are perpetual capital instruments with a contractual "
            "trigger at a 7.000% CET1 ratio for principal write-down.",
        ),
        clause_refs=("§5 Loss absorption", "§6 Perpetual", "§7 CET1 trigger"),
    ),
    _Archetype(
        label="Covered bond",
        subordination="senior_preferred",
        secured=True,
        maturities=(5.0, 7.0, 10.0),
        call_options=(_NO_CALL,),
        excerpts=(
            "The Notes are secured by a cover pool of mortgage receivables "
            "in accordance with the German Pfandbrief Act.",
            "These Notes constitute secured obligations of the Issuer backed "
            "by a dedicated cover pool of public-sector loans.",
            "The Notes are obligations of the Issuer secured by a cover pool "
            "of qualifying mortgage assets under applicable covered bond law.",
        ),
        clause_refs=("§7 Cover pool", "§7.1 Security"),
    ),
    _Archetype(
        label="Senior preferred (subsidiary issuer)",
        subordination="senior_preferred",
        secured=False,
        maturities=(5.0, 7.0),
        call_options=(_NO_CALL,),
        excerpts=(
            "The Notes are issued by a subsidiary of the Resolution Entity "
            "and constitute senior unsecured obligations of the subsidiary.",
            "Senior obligations of an operating subsidiary, not directly of "
            "the Resolution Entity.",
        ),
        clause_refs=("§3.1 Status", "§2 Issuer"),
        issuer_at_resolution_entity=False,
    ),
    _Archetype(
        label="Subordinated note (deeply short-dated)",
        subordination="subordinated",
        secured=False,
        maturities=(0.5, 0.75, 1.0),  # at or just under threshold
        call_options=(_NO_CALL,),
        excerpts=(
            "The Notes mature on the date specified in the Final Terms and "
            "rank junior to all senior creditors of the Issuer.",
            "Short-dated subordinated obligations of the Issuer ranking "
            "junior to senior unsecured liabilities.",
        ),
        clause_refs=("§4.1 Maturity", "§4.2 Subordination"),
    ),
)

_GOVERNING_LAWS: tuple[str, ...] = (
    "English law",
    "French law",
    "German law",
    "Dutch law",
    "Italian law",
)


def _effective_maturity(stated: float, call: _CallOption) -> float:
    """Effective maturity is min(stated, time-to-first-call). For the calls
    we model the call timing is encoded in the description, so we read it
    back from the call id rather than parse text.
    """
    if call.id == "issuer_call_short":
        return 0.5  # called within 6 months
    if call.id == "regulatory_call_5y":
        return min(stated, 5.0)
    if call.id == "regulatory_call_10y":
        return min(stated, 10.0)
    if call.id == "issuer_call_long":
        return min(stated, 7.0)
    return stated


def _classify(
    arch: _Archetype, stated_maturity: float, call: _CallOption
) -> tuple[str, str]:
    """Apply the MREL eligibility rules and return (label, rationale)."""
    if arch.secured:
        return (
            "not_eligible",
            "Secured by a cover pool — secured liabilities are excluded from "
            "MREL eligibility.",
        )
    if not arch.issuer_at_resolution_entity:
        return (
            "not_eligible",
            "Issued by a subsidiary outside the resolution entity — fails "
            "the issuer requirement.",
        )
    if arch.subordination == "senior_preferred":
        return (
            "not_eligible",
            "Senior preferred ranks above SNP and subordinated debt — fails "
            "the subordination requirement.",
        )

    eff = _effective_maturity(stated_maturity, call)
    if eff < 1.0:
        return (
            "not_eligible",
            f"Effective maturity {eff:.2f}y is below the 1-year threshold "
            "(stated maturity adjusted for first call).",
        )

    rationale_bits = []
    if arch.subordination == "deeply_subordinated":
        rationale_bits.append(
            "AT1 is deeply subordinated and loss-absorbing"
        )
    elif arch.subordination == "subordinated":
        rationale_bits.append("subordinated to senior creditors")
    elif arch.subordination == "senior_non_preferred":
        rationale_bits.append(
            "SNP ranks junior to senior preferred and senior to Tier 2"
        )

    if eff >= 99.0:
        rationale_bits.append("perpetual maturity satisfies the residual test")
    else:
        rationale_bits.append(f"effective maturity {eff:.1f}y > 1 year")

    if not arch.secured:
        rationale_bits.append("unsecured")

    return (
        "eligible",
        "; ".join(rationale_bits).capitalize() + ".",
    )


def build_mrel_clause_rows() -> list[dict]:
    """Return the full deterministic dataset.

    Order of nested loops is fixed so rowId<->content is reproducible:
    archetype, maturity, call option, governing law.
    """
    rows: list[dict] = []
    next_id = 1
    for arch in _ARCHETYPES:
        for m_idx, maturity in enumerate(arch.maturities):
            for c_idx, call in enumerate(arch.call_options):
                for g_idx, law in enumerate(_GOVERNING_LAWS):
                    excerpt_text = arch.excerpts[
                        (m_idx + c_idx + g_idx) % len(arch.excerpts)
                    ]
                    clause_ref = arch.clause_refs[
                        (m_idx + c_idx) % len(arch.clause_refs)
                    ]
                    excerpt = excerpt_text + call.description
                    label, rationale = _classify(arch, maturity, call)
                    rows.append(
                        {
                            "rowId": f"r{next_id:03d}",
                            "instrument": arch.label,
                            "clauseRef": clause_ref,
                            "excerpt": excerpt,
                            "subordination": arch.subordination,
                            "maturityYears": maturity,
                            "secured": arch.secured,
                            "governingLaw": law,
                            "label": label,
                            "rationale": rationale,
                        }
                    )
                    next_id += 1
    return rows
