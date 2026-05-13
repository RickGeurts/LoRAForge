from fastapi import APIRouter, HTTPException, Query, status

from app.services import document_loader

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("/list")
def list_documents(path: str = Query(..., description="Absolute directory path")) -> dict:
    try:
        files = document_loader.list_files(path)
    except document_loader.DocumentLoaderError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return {"path": path, "files": [f.as_dict() for f in files]}


@router.get("/read")
def read_document(
    path: str = Query(..., description="Absolute directory path"),
    filename: str = Query(..., description="File name within path"),
) -> dict:
    try:
        text = document_loader.read_file(path, filename)
    except document_loader.DocumentLoaderError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return {"path": path, "filename": filename, "text": text}
