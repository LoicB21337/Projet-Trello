from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal

from bson import ObjectId
from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from pymongo import ASCENDING, AsyncMongoClient, ReturnDocument
from pymongo.errors import PyMongoError

from app.auth import get_current_user, router as auth_router
from app.settings import settings

TaskStatus = Literal["todo", "in_progress", "done"]


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    member_ids: list[str] = Field(default_factory=list, max_length=100)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    member_ids: list[str] | None = Field(default=None, max_length=100)


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    status: TaskStatus = "todo"
    assignee_id: str | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    status: TaskStatus | None = None
    assignee_id: str | None = None


def serialize_project(project: dict) -> dict:
    return {
        "id": str(project["_id"]),
        "name": project["name"],
        "member_ids": [str(member_id) for member_id in project["member_ids"]],
        "created_by": str(project["created_by"]),
        "created_at": project["created_at"],
    }


def serialize_task(task: dict) -> dict:
    assignee_id = task.get("assignee_id")
    return {
        "id": str(task["_id"]),
        "project_id": str(task["project_id"]),
        "title": task["title"],
        "status": task["status"],
        "assignee_id": str(assignee_id) if assignee_id else None,
        "created_at": task["created_at"],
        "updated_at": task["updated_at"],
    }


def object_id_or_404(value: str, detail: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=404, detail=detail)
    return ObjectId(value)


async def require_project(database, project_id: str, user: dict) -> dict:
    project = await database.projects.find_one(
        {
            "_id": object_id_or_404(project_id, "Project not found"),
            "company_id": user["company_id"],
            "member_ids": user["_id"],
        }
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def validate_assignee(database, project: dict, company_id: ObjectId, assignee_id: str | None):
    if assignee_id is None:
        return None
    assignee_object_id = object_id_or_404(assignee_id, "Assignee not found")
    if assignee_object_id not in project["member_ids"]:
        raise HTTPException(status_code=422, detail="Assignee must belong to this project")
    assignee = await database.users.find_one(
        {
            "_id": assignee_object_id,
            "company_id": company_id,
        }
    )
    if assignee is None:
        raise HTTPException(status_code=422, detail="Assignee must belong to this project")
    return assignee_object_id


@asynccontextmanager
async def lifespan(app: FastAPI):
    client = AsyncMongoClient(settings.mongo_connection_string)
    database = client[settings.mongo_database]
    await database.command("ping")
    await database.users.create_index([("email", ASCENDING)], unique=True)
    await database.companies.create_index([("invite_code", ASCENDING)], unique=True)
    await database.projects.create_index(
        [("company_id", ASCENDING), ("member_ids", ASCENDING), ("created_at", ASCENDING)]
    )
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
    version="0.2.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
    lifespan=lifespan,
)
app.include_router(auth_router)


@app.get("/api/health")
async def health(request: Request):
    try:
        await request.app.state.database.command("ping")
    except (AttributeError, PyMongoError):
        raise HTTPException(status_code=503, detail="Database unavailable") from None
    return {"status": "ok"}


@app.get("/api/users")
async def list_company_users(
    request: Request,
    user: dict = Depends(get_current_user),
):
    cursor = request.app.state.database.users.find(
        {"company_id": user["company_id"]},
        {"display_name": 1, "email": 1, "role": 1},
    ).sort("display_name", ASCENDING)
    users = await cursor.to_list(length=500)
    return [
        {
            "id": str(company_user["_id"]),
            "display_name": company_user["display_name"],
            "email": company_user["email"],
            "role": company_user["role"],
        }
        for company_user in users
    ]


@app.get("/api/projects")
async def list_projects(
    request: Request,
    user: dict = Depends(get_current_user),
):
    cursor = request.app.state.database.projects.find(
        {"company_id": user["company_id"], "member_ids": user["_id"]}
    ).sort("created_at", ASCENDING)
    return [serialize_project(project) for project in await cursor.to_list(length=500)]


@app.post("/api/projects", status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    request: Request,
    user: dict = Depends(get_current_user),
):
    database = request.app.state.database
    requested_ids = set(payload.member_ids)
    requested_ids.add(str(user["_id"]))
    if any(not ObjectId.is_valid(member_id) for member_id in requested_ids):
        raise HTTPException(status_code=422, detail="Invalid project member")
    member_ids = [ObjectId(member_id) for member_id in requested_ids]
    member_count = await database.users.count_documents(
        {"company_id": user["company_id"], "_id": {"$in": member_ids}}
    )
    if member_count != len(member_ids):
        raise HTTPException(status_code=422, detail="Members must belong to this company")

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Project name cannot be blank")
    project = {
        "company_id": user["company_id"],
        "name": name,
        "member_ids": member_ids,
        "created_by": user["_id"],
        "created_at": datetime.now(timezone.utc),
    }
    project["_id"] = (await database.projects.insert_one(project)).inserted_id
    return serialize_project(project)


@app.patch("/api/projects/{project_id}")
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    request: Request,
    user: dict = Depends(get_current_user),
):
    database = request.app.state.database
    project = await require_project(database, project_id, user)
    if user["role"] != "owner" and project["created_by"] != user["_id"]:
        raise HTTPException(status_code=403, detail="Only the project owner can edit it")
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=422, detail="No project fields to update")
    if "name" in changes:
        changes["name"] = (changes["name"] or "").strip()
        if not changes["name"]:
            raise HTTPException(status_code=422, detail="Project name cannot be blank")
    if "member_ids" in changes:
        requested_ids = set(changes["member_ids"] or [])
        requested_ids.add(str(user["_id"]))
        if any(not ObjectId.is_valid(member_id) for member_id in requested_ids):
            raise HTTPException(status_code=422, detail="Invalid project member")
        member_ids = [ObjectId(member_id) for member_id in requested_ids]
        member_count = await database.users.count_documents(
            {"company_id": user["company_id"], "_id": {"$in": member_ids}}
        )
        if member_count != len(member_ids):
            raise HTTPException(status_code=422, detail="Members must belong to this company")
        changes["member_ids"] = member_ids
    changes["updated_at"] = datetime.now(timezone.utc)
    project.update(changes)
    await database.projects.update_one(
        {
            "_id": project["_id"],
            "company_id": user["company_id"],
            "member_ids": user["_id"],
        },
        {"$set": changes},
    )
    return serialize_project(project)


@app.delete("/api/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    database = request.app.state.database
    project = await require_project(database, project_id, user)
    if user["role"] != "owner" and project["created_by"] != user["_id"]:
        raise HTTPException(status_code=403, detail="Only the project owner can delete it")
    await database.tasks.delete_many(
        {"company_id": user["company_id"], "project_id": project["_id"]}
    )
    await database.projects.delete_one(
        {"_id": project["_id"], "company_id": user["company_id"]}
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/projects/{project_id}/tasks")
async def list_tasks(
    project_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    project = await require_project(request.app.state.database, project_id, user)
    cursor = request.app.state.database.tasks.find(
        {"company_id": user["company_id"], "project_id": project["_id"]}
    ).sort("created_at", ASCENDING)
    return [serialize_task(task) for task in await cursor.to_list(length=500)]


@app.post("/api/projects/{project_id}/tasks", status_code=status.HTTP_201_CREATED)
async def create_task(
    project_id: str,
    payload: TaskCreate,
    request: Request,
    user: dict = Depends(get_current_user),
):
    database = request.app.state.database
    project = await require_project(database, project_id, user)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Task title cannot be blank")
    assignee_id = await validate_assignee(
        database, project, user["company_id"], payload.assignee_id
    )
    now = datetime.now(timezone.utc)
    task = {
        "company_id": user["company_id"],
        "project_id": project["_id"],
        "title": title,
        "status": payload.status,
        "assignee_id": assignee_id,
        "created_by": user["_id"],
        "created_at": now,
        "updated_at": now,
    }
    task["_id"] = (await database.tasks.insert_one(task)).inserted_id
    return serialize_task(task)


@app.patch("/api/projects/{project_id}/tasks/{task_id}")
async def update_task(
    project_id: str,
    task_id: str,
    payload: TaskUpdate,
    request: Request,
    user: dict = Depends(get_current_user),
):
    database = request.app.state.database
    project = await require_project(database, project_id, user)
    task_object_id = object_id_or_404(task_id, "Task not found")
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=422, detail="No task fields to update")
    if "title" in changes:
        changes["title"] = (changes["title"] or "").strip()
        if not changes["title"]:
            raise HTTPException(status_code=422, detail="Task title cannot be blank")
    if "assignee_id" in changes:
        changes["assignee_id"] = await validate_assignee(
            database, project, user["company_id"], changes["assignee_id"]
        )
    changes["updated_at"] = datetime.now(timezone.utc)
    task = await database.tasks.find_one_and_update(
        {
            "_id": task_object_id,
            "company_id": user["company_id"],
            "project_id": project["_id"],
        },
        {"$set": changes},
        return_document=ReturnDocument.AFTER,
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return serialize_task(task)


@app.delete("/api/projects/{project_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    project_id: str,
    task_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    database = request.app.state.database
    project = await require_project(database, project_id, user)
    result = await database.tasks.delete_one(
        {
            "_id": object_id_or_404(task_id, "Task not found"),
            "company_id": user["company_id"],
            "project_id": project["_id"],
        }
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)