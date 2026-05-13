"""Filesystem-backed document loader for the Document Handler node.

Lists and reads plain-text documents from an analyst-supplied absolute
path. Intentionally simple: no PDF parsing (CLAUDE.md non-goal), no
recursion, no sandboxing beyond extension filtering and a per-file size
cap. The dev tool is local-first with no auth — analysts pointing at
their own filesystem are trusted.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

_ALLOWED_EXTENSIONS = {".txt", ".md"}
_MAX_BYTES = 5 * 1024 * 1024  # 5MB — generous for prospectus text


class DocumentLoaderError(Exception):
    """Raised when a path is invalid or a file can't be served."""


@dataclass(frozen=True)
class DocumentEntry:
    name: str
    size: int

    def as_dict(self) -> dict[str, int | str]:
        return {"name": self.name, "size": self.size}


def _resolve_dir(path: str) -> Path:
    if not path:
        raise DocumentLoaderError("path is required")
    p = Path(path)
    if not p.is_absolute():
        raise DocumentLoaderError("path must be absolute")
    if not p.exists():
        raise DocumentLoaderError(f"path does not exist: {path}")
    if not p.is_dir():
        raise DocumentLoaderError(f"path is not a directory: {path}")
    return p


def list_files(path: str) -> list[DocumentEntry]:
    """Top-level files matching allowed extensions. Sorted by name."""
    directory = _resolve_dir(path)
    entries: list[DocumentEntry] = []
    for child in sorted(directory.iterdir(), key=lambda p: p.name.lower()):
        if not child.is_file():
            continue
        if child.suffix.lower() not in _ALLOWED_EXTENSIONS:
            continue
        try:
            size = child.stat().st_size
        except OSError:
            continue
        entries.append(DocumentEntry(name=child.name, size=size))
    return entries


def read_file(path: str, filename: str) -> str:
    """Read a single file's text content (UTF-8, capped at _MAX_BYTES)."""
    directory = _resolve_dir(path)
    if not filename or "/" in filename or "\\" in filename or filename.startswith("."):
        raise DocumentLoaderError("invalid filename")
    target = directory / filename
    if not target.is_file():
        raise DocumentLoaderError(f"file not found: {filename}")
    if target.suffix.lower() not in _ALLOWED_EXTENSIONS:
        raise DocumentLoaderError(f"unsupported file type: {target.suffix}")
    if target.stat().st_size > _MAX_BYTES:
        raise DocumentLoaderError(
            f"file too large (>{_MAX_BYTES // (1024 * 1024)} MB): {filename}"
        )
    return target.read_text(encoding="utf-8", errors="replace")


@dataclass(frozen=True)
class LoadedDocument:
    filename: str
    text: str


def read_all_files(path: str) -> list[LoadedDocument]:
    """Read every supported file in the directory in name order."""
    entries = list_files(path)
    out: list[LoadedDocument] = []
    for entry in entries:
        out.append(LoadedDocument(filename=entry.name, text=read_file(path, entry.name)))
    return out
