"""Admin endpoints. Every route requires a valid bearer token."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import authenticate, create_access_token, get_current_user, hash_password
from app.models import AuditLog, Figure, Issue, Modifier, Relationship, RelationshipIssue, User
from app.schemas import (
    AuditEntryOut,
    AuditListOut,
    FigureCreate,
    FigureUpdate,
    ImportProblemOut,
    ImportResultOut,
    IssueCreate,
    IssueUpdate,
    LoginIn,
    ModifierIn,
    PasswordChangeIn,
    RelationshipCreate,
    RelationshipIssueIn,
    RelationshipUpdate,
    TokenOut,
)
from app.services import importer
from app.services import repository as repo

router = APIRouter(tags=["admin"])


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # Surface the constraint failure as a 400 rather than a 500.
        raise HTTPException(status_code=400, detail=f"Constraint violation: {exc.orig}") from exc


# --------------------------------------------------------------------------- auth
@router.post("/auth/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    user = authenticate(db, payload.username, payload.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Username atau password salah",
        )
    token, expires_in = create_access_token(user.username)
    return TokenOut(access_token=token, expires_in=expires_in, username=user.username)


@router.post("/auth/change-password")
def change_password(
    payload: PasswordChangeIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    from app.core.security import verify_password

    if not verify_password(payload.old_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Password lama salah")
    user.hashed_password = hash_password(payload.new_password)
    repo.write_audit(db, actor=user.username, entity="user", entity_id=user.id, action="password")
    _commit(db)
    return {"ok": True}


# --------------------------------------------------------------------------- figures
@router.post("/figures", status_code=201)
def create_figure(
    payload: FigureCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    figure = Figure(
        name=payload.name,
        full_name=payload.full_name,
        role=payload.role,
        party=payload.party,
        bloc=payload.bloc,
        region=payload.region,
        photo_url=payload.photo_url,
        bio=payload.bio,
        tags=",".join(payload.tags),
        influence=payload.influence,
        is_active=payload.is_active,
    )
    db.add(figure)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Nama figur sudah dipakai") from exc
    repo.write_audit(
        db, actor=user.username, entity="figure", entity_id=figure.id, action="create",
        detail=payload.name,
    )
    _commit(db)
    return {"id": figure.id}


@router.put("/figures/{figure_id}")
def update_figure(
    figure_id: int,
    payload: FigureUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    figure = db.get(Figure, figure_id)
    if figure is None:
        raise HTTPException(status_code=404, detail="Figure not found")
    for field in ("name", "full_name", "role", "party", "bloc", "region", "photo_url", "bio",
                  "influence", "is_active"):
        setattr(figure, field, getattr(payload, field))
    figure.tags = ",".join(payload.tags)
    repo.write_audit(
        db, actor=user.username, entity="figure", entity_id=figure_id, action="update",
        detail=payload.name,
    )
    _commit(db)
    return {"ok": True}


@router.delete("/figures/{figure_id}")
def delete_figure(
    figure_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    figure = db.get(Figure, figure_id)
    if figure is None:
        raise HTTPException(status_code=404, detail="Figure not found")
    db.delete(figure)
    repo.write_audit(db, actor=user.username, entity="figure", entity_id=figure_id, action="delete")
    _commit(db)
    return {"ok": True}


# --------------------------------------------------------------------------- issues
@router.post("/issues", status_code=201)
def create_issue(
    payload: IssueCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    issue = Issue(**payload.model_dump())
    db.add(issue)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Nama isu sudah dipakai") from exc
    repo.write_audit(
        db, actor=user.username, entity="issue", entity_id=issue.id, action="create",
        detail=payload.name,
    )
    _commit(db)
    return {"id": issue.id}


@router.put("/issues/{issue_id}")
def update_issue(
    issue_id: int,
    payload: IssueUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    issue = db.get(Issue, issue_id)
    if issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    for field, value in payload.model_dump().items():
        setattr(issue, field, value)
    repo.write_audit(
        db, actor=user.username, entity="issue", entity_id=issue_id, action="update",
        detail=payload.name,
    )
    _commit(db)
    return {"ok": True}


@router.delete("/issues/{issue_id}")
def delete_issue(
    issue_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    issue = db.get(Issue, issue_id)
    if issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    db.delete(issue)
    repo.write_audit(db, actor=user.username, entity="issue", entity_id=issue_id, action="delete")
    _commit(db)
    return {"ok": True}


# --------------------------------------------------------------------------- relationships
@router.post("/relationships", status_code=201)
def create_relationship(
    payload: RelationshipCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    if db.get(Figure, payload.source_id) is None or db.get(Figure, payload.target_id) is None:
        raise HTTPException(status_code=400, detail="Figur tidak ditemukan")
    rel = Relationship(**payload.model_dump())
    db.add(rel)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Relasi untuk pasangan ini sudah ada") from exc
    repo.write_audit(
        db, actor=user.username, entity="relationship", entity_id=rel.id, action="create",
        detail=f"{payload.source_id}->{payload.target_id}",
    )
    _commit(db)
    return {"id": rel.id}


@router.put("/relationships/{rel_id}")
def update_relationship(
    rel_id: int,
    payload: RelationshipUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    rel = db.get(Relationship, rel_id)
    if rel is None:
        raise HTTPException(status_code=404, detail="Relationship not found")
    for field, value in payload.model_dump().items():
        setattr(rel, field, value)
    repo.write_audit(
        db, actor=user.username, entity="relationship", entity_id=rel_id, action="update"
    )
    _commit(db)
    return {"ok": True}


@router.delete("/relationships/{rel_id}")
def delete_relationship(
    rel_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    rel = db.get(Relationship, rel_id)
    if rel is None:
        raise HTTPException(status_code=404, detail="Relationship not found")
    db.delete(rel)
    repo.write_audit(
        db, actor=user.username, entity="relationship", entity_id=rel_id, action="delete"
    )
    _commit(db)
    return {"ok": True}


@router.post("/relationships/{rel_id}/issues")
def upsert_relationship_issue(
    rel_id: int,
    payload: RelationshipIssueIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    rel = db.get(Relationship, rel_id)
    if rel is None:
        raise HTTPException(status_code=404, detail="Relationship not found")
    if db.get(Issue, payload.issue_id) is None:
        raise HTTPException(status_code=400, detail="Isu tidak ditemukan")

    row = db.scalars(
        select(RelationshipIssue).where(
            RelationshipIssue.relationship_id == rel_id,
            RelationshipIssue.issue_id == payload.issue_id,
        )
    ).first()
    if row is None:
        row = RelationshipIssue(relationship_id=rel_id, issue_id=payload.issue_id)
        db.add(row)
    row.score = payload.score
    row.weight = payload.weight
    row.stance = payload.stance
    row.evidence_url = payload.evidence_url

    repo.write_audit(
        db, actor=user.username, entity="relationship_issue", entity_id=rel_id, action="upsert",
        detail=f"issue={payload.issue_id} score={payload.score} weight={payload.weight}",
    )
    _commit(db)
    return {"ok": True}


@router.delete("/relationships/{rel_id}/issues/{issue_id}")
def delete_relationship_issue(
    rel_id: int,
    issue_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    db.execute(
        delete(RelationshipIssue).where(
            RelationshipIssue.relationship_id == rel_id,
            RelationshipIssue.issue_id == issue_id,
        )
    )
    repo.write_audit(
        db, actor=user.username, entity="relationship_issue", entity_id=rel_id, action="delete",
        detail=f"issue={issue_id}",
    )
    _commit(db)
    return {"ok": True}


# --------------------------------------------------------------------------- modifiers
@router.post("/relationships/{rel_id}/modifiers", status_code=201)
def create_modifier(
    rel_id: int,
    payload: ModifierIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    if db.get(Relationship, rel_id) is None:
        raise HTTPException(status_code=404, detail="Relationship not found")
    mod = Modifier(relationship_id=rel_id, **payload.model_dump())
    db.add(mod)
    db.flush()
    repo.write_audit(
        db, actor=user.username, entity="modifier", entity_id=mod.id, action="create",
        detail=f"{payload.label} {payload.value:+d}",
    )
    _commit(db)
    return {"id": mod.id}


@router.put("/modifiers/{mod_id}")
def update_modifier(
    mod_id: int,
    payload: ModifierIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    mod = db.get(Modifier, mod_id)
    if mod is None:
        raise HTTPException(status_code=404, detail="Modifier not found")
    for field, value in payload.model_dump().items():
        setattr(mod, field, value)
    repo.write_audit(
        db, actor=user.username, entity="modifier", entity_id=mod_id, action="update",
        detail=payload.label,
    )
    _commit(db)
    return {"ok": True}


@router.delete("/modifiers/{mod_id}")
def delete_modifier(
    mod_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    mod = db.get(Modifier, mod_id)
    if mod is None:
        raise HTTPException(status_code=404, detail="Modifier not found")
    db.delete(mod)
    repo.write_audit(db, actor=user.username, entity="modifier", entity_id=mod_id, action="delete")
    _commit(db)
    return {"ok": True}


# --------------------------------------------------------------------------- import
@router.post("/import/preview", response_model=ImportResultOut)
async def preview_import(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ImportResultOut:
    """Validate an upload and report what it would do, without writing.

    Runs exactly the checks the apply endpoint runs, so a clean preview means
    the apply will succeed. Nothing is committed.
    """
    rows = await _read_upload(files)
    if isinstance(rows, ImportResultOut):
        return rows
    figures, issues, relationships, problems = rows

    result = importer.run_import(
        db,
        figures=figures,
        issues=issues,
        relationships=relationships,
        parse_problems=problems,
        apply=False,
    )
    return ImportResultOut.model_validate(result.as_dict())


@router.post("/import", response_model=ImportResultOut)
async def apply_import(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ImportResultOut:
    """Validate and write. Refuses the whole upload if any row is invalid."""
    rows = await _read_upload(files)
    if isinstance(rows, ImportResultOut):
        return rows
    figures, issues, relationships, problems = rows

    result = importer.run_import(
        db,
        figures=figures,
        issues=issues,
        relationships=relationships,
        parse_problems=problems,
        apply=True,
    )

    if result.ok:
        totals = result.counts
        summary = ", ".join(
            f"{name} {counts.created} baru/{counts.updated} diperbarui"
            for name, counts in totals.items()
            if counts.created or counts.updated
        )
        repo.write_audit(
            db,
            actor=user.username,
            entity="dataset",
            entity_id=None,
            action="import",
            detail=summary or "tidak ada perubahan",
        )
        _commit(db)

    return ImportResultOut.model_validate(result.as_dict())


async def _read_upload(
    files: list[UploadFile],
) -> tuple[list[importer.Row], list[importer.Row], list[importer.Row], list[importer.Problem]] | ImportResultOut:
    """Turn the uploaded files into rows, or return an early error result.

    A single .json file is read as a bundle; anything else is treated as the CSV
    set. The distinction is made on the extension because that is what a
    contributor controls.
    """
    decoded: dict[str, str] = {}
    for upload in files:
        raw = await upload.read()
        name = upload.filename or "unnamed"
        try:
            decoded[name] = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            return ImportResultOut(
                ok=False,
                applied=False,
                counts={},
                problems=[
                    ImportProblemOut(
                        severity="error",
                        location=name,
                        message=(
                            "File bukan teks UTF-8. Kalau diekspor dari Excel, "
                            "simpan ulang sebagai CSV UTF-8."
                        ),
                    )
                ],
            )

    json_files = [n for n in decoded if n.casefold().endswith(".json")]
    if json_files:
        if len(decoded) > 1:
            return ImportResultOut(
                ok=False,
                applied=False,
                counts={},
                problems=[
                    ImportProblemOut(
                        severity="error",
                        location="unggahan",
                        message=(
                            "Kirim satu file JSON saja, atau kumpulan CSV. "
                            "Jangan mencampurnya."
                        ),
                    )
                ],
            )
        figures, issues, relationships, problems = importer.parse_bundle(
            decoded[json_files[0]]
        )
        return figures, issues, relationships, problems

    return importer.parse_csv_files(decoded)


# --------------------------------------------------------------------------- export
@router.get("/export")
def export_bundle(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Response:
    """Download the whole dataset in the import format.

    Doubles as the template: a contributor can export, edit, and re-import the
    same file, which guarantees the format is round-trippable rather than
    aspirational.
    """
    payload = importer.build_bundle(db)
    body = json.dumps(payload, indent=2, ensure_ascii=False)
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="prism-bundle.json"'},
    )


# --------------------------------------------------------------------------- audit
@router.get("/audit", response_model=AuditListOut)
def get_audit(
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> AuditListOut:
    rows = list(db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(limit)))
    return AuditListOut(entries=[AuditEntryOut.model_validate(r) for r in rows], count=len(rows))
