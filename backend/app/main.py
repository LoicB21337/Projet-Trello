from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal

from bson import ObjectId
from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from pymongo import ASCENDING, AsyncMongoClient, ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.auth import SESSION_COOKIE, get_current_user, router as auth_router, serialize_company
from app.settings import settings

TaskStatus = Literal["todo", "in_progress", "done"]


class ChecklistItem(BaseModel):
    id: str = Field(default_factory=lambda: str(ObjectId()), min_length=1, max_length=100)
    text: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    completed: bool = False

    @field_validator("text")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Checklist item text cannot be blank")
        return normalized


def validate_checklist_ids(items: list[ChecklistItem] | None):
    if items is not None and len({item.id for item in items}) != len(items):
        raise ValueError("Checklist item IDs must be unique")
    return items


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    member_ids: list[str] = Field(default_factory=list, max_length=100)
    description: str | None = Field(default=None, max_length=2000)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    member_ids: list[str] | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=2000)


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    status: TaskStatus = "todo"
    assignee_ids: list[str] = Field(default_factory=list, max_length=100)
    assignee_id: str | None = None
    description: str | None = Field(default=None, max_length=2000)
    due_at: datetime | None = None
    checklist: list[ChecklistItem] = Field(default_factory=list, max_length=100)
    blocked_by_ids: list[str] = Field(default_factory=list, max_length=100)

    @field_validator("checklist")
    @classmethod
    def unique_checklist_ids(cls, items: list[ChecklistItem]) -> list[ChecklistItem]:
        return validate_checklist_ids(items)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    status: TaskStatus | None = None
    assignee_ids: list[str] | None = Field(default=None, max_length=100)
    assignee_id: str | None = None
    description: str | None = Field(default=None, max_length=2000)
    due_at: datetime | None = None
    checklist: list[ChecklistItem] | None = Field(default=None, max_length=100)
    blocked_by_ids: list[str] | None = Field(default=None, max_length=100)

    @field_validator("checklist")
    @classmethod
    def unique_checklist_ids(
        cls, items: list[ChecklistItem] | None
    ) -> list[ChecklistItem] | None:
        return validate_checklist_ids(items)


class CompanyUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    email: EmailStr | None = None


def serialize_project(project: dict) -> dict:
    return {
        "id": str(project["_id"]),
        "name": project["name"],
        "member_ids": [str(member_id) for member_id in project["member_ids"]],
        "created_by": str(project["created_by"]),
        "created_at": project["created_at"],
        "description": project.get("description"),
    }


def serialize_task(task: dict) -> dict:
    assignee_ids = task.get("assignee_ids")
    if assignee_ids is None:
        legacy_assignee_id = task.get("assignee_id")
        assignee_ids = [legacy_assignee_id] if legacy_assignee_id is not None else []
    serialized_assignee_ids = [str(assignee_id) for assignee_id in assignee_ids]
    due_at = task.get("due_at")
    if due_at is not None:
        if due_at.tzinfo is None:
            due_at = due_at.replace(tzinfo=timezone.utc)
        else:
            due_at = due_at.astimezone(timezone.utc)
    return {
        "id": str(task["_id"]),
        "project_id": str(task["project_id"]),
        "title": task["title"],
        "status": task["status"],
        "assignee_ids": serialized_assignee_ids,
        "assignee_id": serialized_assignee_ids[0] if serialized_assignee_ids else None,
        "created_at": task["created_at"],
        "updated_at": task["updated_at"],
        "description": task.get("description"),
        "due_at": due_at.isoformat() if due_at is not None else None,
        "checklist": [
            {
                "id": item["id"],
                "text": item["text"],
                "description": item.get("description", "") or "",
                "completed": item["completed"],
            }
            for item in task.get("checklist") or []
        ],
        "blocked_by_ids": [
            str(task_id) for task_id in task.get("blocked_by_ids") or []
        ],
    }


def require_owner(user: dict) -> None:
    if user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only the company owner can manage it")


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


async def validate_assignees(
    database, project: dict, company_id: ObjectId, assignee_ids: list[str] | None
):
    unique_ids = list(dict.fromkeys(assignee_ids or []))
    assignee_object_ids = [
        object_id_or_404(assignee_id, "Assignee not found")
        for assignee_id in unique_ids
    ]
    if any(
        assignee_id not in project["member_ids"]
        for assignee_id in assignee_object_ids
    ):
        raise HTTPException(
            status_code=422, detail="Assignees must belong to this project"
        )
    if assignee_object_ids:
        assignee_count = await database.users.count_documents(
            {
                "_id": {"$in": assignee_object_ids},
                "company_id": company_id,
            }
        )
        if assignee_count != len(assignee_object_ids):
            raise HTTPException(
                status_code=422, detail="Assignees must belong to this project"
            )
    return assignee_object_ids


async def validate_task_dependencies(
    database,
    project: dict,
    company_id: ObjectId,
    task_id: ObjectId | None,
    blocked_by_ids: list[str] | None,
) -> list[dict]:
    dependency_ids = list(dict.fromkeys(blocked_by_ids or []))
    if any(not ObjectId.is_valid(dependency_id) for dependency_id in dependency_ids):
        raise HTTPException(status_code=422, detail="Invalid prerequisite task")
    dependency_object_ids = [ObjectId(dependency_id) for dependency_id in dependency_ids]
    if task_id is not None and task_id in dependency_object_ids:
        raise HTTPException(status_code=422, detail="A task cannot depend on itself")

    dependencies = []
    for dependency_id in dependency_object_ids:
        dependency = await database.tasks.find_one(
            {
                "_id": dependency_id,
                "company_id": company_id,
                "project_id": project["_id"],
            }
        )
        if dependency is None:
            raise HTTPException(
                status_code=422,
                detail="Prerequisite tasks must belong to this project",
            )
        dependencies.append(dependency)

    if task_id is not None:
        pending = list(dependency_object_ids)
        visited = set()
        while pending:
            candidate_id = pending.pop()
            if candidate_id == task_id:
                raise HTTPException(
                    status_code=422,
                    detail="Task dependencies cannot contain a cycle",
                )
            if candidate_id in visited:
                continue
            visited.add(candidate_id)
            candidate = await database.tasks.find_one(
                {
                    "_id": candidate_id,
                    "company_id": company_id,
                    "project_id": project["_id"],
                }
            )
            if candidate is None:
                continue
            pending.extend(
                ObjectId(value)
                for value in candidate.get("blocked_by_ids", [])
                if ObjectId.is_valid(value)
            )

    return dependencies


def reject_unfinished_dependencies(dependencies: list[dict]) -> None:
    if any(dependency.get("status") != "done" for dependency in dependencies):
        raise HTTPException(
            status_code=409,
            detail="Terminez d'abord les taches prerequises.",
        )


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


@app.get("/api/company")
async def get_company(
    request: Request,
    user: dict = Depends(get_current_user),
):
    company = await request.app.state.database.companies.find_one(
        {"_id": user["company_id"]}
    )
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    return serialize_company(company, include_invite_code=True)


@app.patch("/api/company")
async def update_company(
    payload: CompanyUpdate,
    request: Request,
    user: dict = Depends(get_current_user),
):
    require_owner(user)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Company name cannot be blank")
    company = await request.app.state.database.companies.find_one_and_update(
        {"_id": user["company_id"]},
        {"$set": {"name": name}},
        return_document=ReturnDocument.AFTER,
    )
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    return serialize_company(company, include_invite_code=True)


@app.delete("/api/company", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company(
    request: Request,
    user: dict = Depends(get_current_user),
):
    require_owner(user)
    database = request.app.state.database
    company_id = user["company_id"]
    company = await database.companies.find_one({"_id": company_id})
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    await database.tasks.delete_many({"company_id": company_id})
    await database.projects.delete_many({"company_id": company_id})
    await database.users.delete_many({"company_id": company_id})
    await database.companies.delete_one({"_id": company_id})
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(
        key=SESSION_COOKIE,
        path="/api",
        secure=settings.auth_cookie_secure,
        httponly=True,
        samesite="strict",
    )
    return response


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


@app.patch("/api/users/{user_id}")
async def update_company_user(
    user_id: str,
    payload: UserUpdate,
    request: Request,
    user: dict = Depends(get_current_user),
):
    require_owner(user)
    target_id = object_id_or_404(user_id, "User not found")
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=422, detail="No user fields to update")
    if "display_name" in changes:
        changes["display_name"] = (changes["display_name"] or "").strip()
        if not changes["display_name"]:
            raise HTTPException(status_code=422, detail="User name cannot be blank")
    if "email" in changes:
        if changes["email"] is None:
            raise HTTPException(status_code=422, detail="Email cannot be blank")
        changes["email"] = str(changes["email"]).strip().lower()
    try:
        updated_user = await request.app.state.database.users.find_one_and_update(
            {"_id": target_id, "company_id": user["company_id"]},
            {"$set": changes},
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="This email address is already in use") from None
    if updated_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": str(updated_user["_id"]),
        "display_name": updated_user["display_name"],
        "email": updated_user["email"],
        "role": updated_user["role"],
    }


@app.delete("/api/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company_user(
    user_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    require_owner(user)
    target_id = object_id_or_404(user_id, "User not found")
    if target_id == user["_id"]:
        raise HTTPException(status_code=403, detail="You cannot delete your own account")
    database = request.app.state.database
    company_id = user["company_id"]
    target = await database.users.find_one({"_id": target_id, "company_id": company_id})
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "owner":
        raise HTTPException(status_code=403, detail="The company owner cannot be deleted")

    await database.projects.update_many(
        {
            "company_id": company_id,
            "$or": [{"member_ids": target_id}, {"created_by": target_id}],
        },
        {"$addToSet": {"member_ids": user["_id"]}},
    )
    await database.projects.update_many(
        {"company_id": company_id, "member_ids": target_id},
        {"$pull": {"member_ids": target_id}},
    )
    await database.projects.update_many(
        {"company_id": company_id, "created_by": target_id},
        {"$set": {"created_by": user["_id"]}},
    )
    await database.tasks.update_many(
        {"company_id": company_id, "assignee_ids": target_id},
        {"$pull": {"assignee_ids": target_id}},
    )
    await database.tasks.update_many(
        {"company_id": company_id, "assignee_id": target_id},
        {"$unset": {"assignee_id": ""}},
    )
    await database.tasks.update_many(
        {"company_id": company_id, "created_by": target_id},
        {"$set": {"created_by": user["_id"]}},
    )
    await database.users.delete_one({"_id": target_id, "company_id": company_id})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
        "description": payload.description,
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
    if {"assignee_ids", "assignee_id"}.issubset(payload.model_fields_set):
        raise HTTPException(
            status_code=422, detail="Use either assignee_ids or the legacy assignee_id field"
        )
    if "assignee_ids" in payload.model_fields_set:
        requested_assignee_ids = payload.assignee_ids
    elif payload.assignee_id is not None:
        requested_assignee_ids = [payload.assignee_id]
    else:
        requested_assignee_ids = []
    assignee_ids = await validate_assignees(
        database, project, user["company_id"], requested_assignee_ids
    )
    dependencies = await validate_task_dependencies(
        database,
        project,
        user["company_id"],
        None,
        payload.blocked_by_ids,
    )
    if payload.status != "todo":
        reject_unfinished_dependencies(dependencies)
    now = datetime.now(timezone.utc)
    task = {
        "company_id": user["company_id"],
        "project_id": project["_id"],
        "title": title,
        "status": payload.status,
        "assignee_ids": assignee_ids,
        "description": payload.description,
        "due_at": payload.due_at,
        "checklist": [item.model_dump() for item in payload.checklist],
        "blocked_by_ids": [dependency["_id"] for dependency in dependencies],
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
    task_filter = {
        "_id": task_object_id,
        "company_id": user["company_id"],
        "project_id": project["_id"],
    }
    existing_task = await database.tasks.find_one(task_filter)
    if existing_task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=422, detail="No task fields to update")
    if {"assignee_ids", "assignee_id"}.issubset(changes):
        raise HTTPException(
            status_code=422, detail="Use either assignee_ids or the legacy assignee_id field"
        )
    if "title" in changes:
        changes["title"] = (changes["title"] or "").strip()
        if not changes["title"]:
            raise HTTPException(status_code=422, detail="Task title cannot be blank")
    if "assignee_id" in changes:
        legacy_assignee_id = changes.pop("assignee_id")
        changes["assignee_ids"] = (
            [legacy_assignee_id] if legacy_assignee_id is not None else []
        )
    if "assignee_ids" in changes:
        changes["assignee_ids"] = await validate_assignees(
            database, project, user["company_id"], changes["assignee_ids"]
        )
    if "checklist" in changes:
        changes["checklist"] = [item.model_dump() for item in payload.checklist or []]
    dependencies = None
    if "blocked_by_ids" in changes:
        dependencies = await validate_task_dependencies(
            database,
            project,
            user["company_id"],
            task_object_id,
            changes["blocked_by_ids"] or [],
        )
        changes["blocked_by_ids"] = [
            dependency["_id"] for dependency in dependencies
        ]
    effective_status = changes.get("status", existing_task["status"])
    status_changed = (
        "status" in changes and effective_status != existing_task["status"]
    )
    dependencies_changed = "blocked_by_ids" in changes
    if effective_status != "todo" and (status_changed or dependencies_changed):
        if dependencies is None:
            dependencies = await validate_task_dependencies(
                database,
                project,
                user["company_id"],
                task_object_id,
                [str(value) for value in existing_task.get("blocked_by_ids", [])],
            )
        reject_unfinished_dependencies(dependencies)
    changes["updated_at"] = datetime.now(timezone.utc)
    update = {"$set": changes}
    if "assignee_ids" in changes:
        update["$unset"] = {"assignee_id": ""}
    task = await database.tasks.find_one_and_update(
        {
            **task_filter,
        },
        update,
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
    task_object_id = object_id_or_404(task_id, "Task not found")
    result = await database.tasks.delete_one(
        {
            "_id": task_object_id,
            "company_id": user["company_id"],
            "project_id": project["_id"],
        }
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    await database.tasks.update_many(
        {
            "company_id": user["company_id"],
            "project_id": project["_id"],
            "blocked_by_ids": task_object_id,
        },
        {"$pull": {"blocked_by_ids": task_object_id}},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)