from fastapi import APIRouter, Depends, Form, HTTPException, Response, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.db import get_session
from app.models import GroupPhoto

router = APIRouter(prefix=f"{settings.api_prefix}/group-photos", tags=["group-photos"])


@router.post("", status_code=200)
async def upload_group_photo(
    group_key: str = Form(...),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
):
    data = await file.read()
    content_type = file.content_type or "image/jpeg"
    result = await session.execute(select(GroupPhoto).where(GroupPhoto.group_key == group_key))
    photo = result.scalar_one_or_none()
    if photo is None:
        photo = GroupPhoto(group_key=group_key, content_type=content_type, data=data)
        session.add(photo)
    else:
        photo.content_type = content_type
        photo.data = data
    await session.commit()
    await session.refresh(photo)
    return {"group_key": photo.group_key, "updated_at": photo.updated_at}


@router.get("")
async def list_group_photos(session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(GroupPhoto.group_key, GroupPhoto.updated_at).order_by(GroupPhoto.group_key)
    )
    return [{"group_key": row.group_key, "updated_at": row.updated_at} for row in result.all()]


@router.get("/image")
async def get_group_photo_image(key: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(GroupPhoto).where(GroupPhoto.group_key == key))
    photo = result.scalar_one_or_none()
    if photo is None:
        raise HTTPException(status_code=404, detail="Photo not found")
    return Response(content=photo.data, media_type=photo.content_type)
