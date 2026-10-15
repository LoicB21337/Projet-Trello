from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal

from bson import ObjectId
from fastapi import FastAPI, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from pymongo import ASCENDING, AsyncMongoClient, ReturnDocument
from pymongo.errors import PyMongoError

from app.settings import settings

TaskStatus = Literal["todo", "in_progress", "done"]


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    status: TaskStatus = "todo"


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    status: TaskStatus | None = None


def serialize_task(document: dict) -> dict:
    return {
        "id": str(document["_id"]),
        "title": document["title"],
        "status": document["status"],
        "created_at": document["created_at"],
        "updated_at": document["updated_at"],
    }


def task_scope() -> dict:
    return {
        "company_id": settings.demo_company_id,
        "project_id": settings.default_project_id,
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    client = AsyncMongoClient(settings.mongo_connection_string)
    database = client[settings.mongo_database]
    await database.command("ping")
    await database.tasks.create_index(
        [
            ("company_id", ASCENDING),
            ("project_id", ASCENDING),
            ("created_at", ASCENDING),
        ]
    )
    app.state.mongo_client = client
    app.state.database = database
    try:
        yield
    finally:
        await client.close()


app = FastAPI(
    title="Tandem API",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
    lifespan=lifespan,
)


@app.get("/api/health")
async def health(request: Request):
    try:
        await request.app.state.database.command("ping")
    except (AttributeError, PyMongoError):
        raise HTTPException(status_code=503, detail="Database unavailable") from None
    return {"status": "ok"}


@app.get("/api/tasks")
async def list_tasks(request: Request):
    cursor = request.app.state.database.tasks.find(task_scope()).sort("created_at", ASCENDING)
    documents = await cursor.to_list(length=500)
    return [serialize_task(document) for document in documents]


@app.post("/api/tasks", status_code=status.HTTP_201_CREATED)
async def create_task(task: TaskCreate, request: Request):
    now = datetime.now(timezone.utc)
    document = {
        **task_scope(),
        "title": task.title.strip(),
        "status": task.status,
        "created_at": now,
        "updated_at": now,
    }
    if not document["title"]:
        raise HTTPException(status_code=422, detail="Title cannot be blank")
    result = await request.app.state.database.tasks.insert_one(document)
    document["_id"] = result.inserted_id
    return serialize_task(document)


@app.patch("/api/tasks/{task_id}")
async def update_task(task_id: str, task: TaskUpdate, request: Request):
    if not ObjectId.is_valid(task_id):
        raise HTTPException(status_code=404, detail="Task not found")
    changes = task.model_dump(exclude_unset=True, exclude_none=True)
    if "title" in changes:
        changes["title"] = changes["title"].strip()
        if not changes["title"]:
            raise HTTPException(status_code=422, detail="Title cannot be blank")
    if not changes:
        raise HTTPException(status_code=422, detail="No task fields to update")
    changes["updated_at"] = datetime.now(timezone.utc)
    document = await request.app.state.database.tasks.find_one_and_update(
        {"_id": ObjectId(task_id), **task_scope()},
        {"$set": changes},
        return_document=ReturnDocument.AFTER,
    )
    if document is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return serialize_task(document)


@app.delete("/api/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: str, request: Request):
    if not ObjectId.is_valid(task_id):
        raise HTTPException(status_code=404, detail="Task not found")
    result = await request.app.state.database.tasks.delete_one(
        {"_id": ObjectId(task_id), **task_scope()}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)