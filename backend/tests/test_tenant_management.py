import asyncio
import copy
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bson import ObjectId
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from app.main import (
    CompanyUpdate,
    ProjectCreate,
    ProjectUpdate,
    TaskCreate,
    TaskUpdate,
    UserUpdate,
    create_project,
    create_task,
    delete_company,
    delete_company_user,
    get_company,
    update_company,
    update_company_user,
    update_project,
    update_task,
)


def matches(document, query):
    for key, expected in query.items():
        if key == "$or":
            if not any(matches(document, option) for option in expected):
                return False
        elif isinstance(expected, dict) and "$in" in expected:
            if document.get(key) not in expected["$in"]:
                return False
        elif isinstance(document.get(key), list):
            if expected not in document[key]:
                return False
        elif document.get(key) != expected:
            return False
    return True


class Collection:
    def __init__(self, documents=()):
        self.documents = [copy.deepcopy(document) for document in documents]

    async def find_one(self, query):
        return next((doc for doc in self.documents if matches(doc, query)), None)

    async def find_one_and_update(self, query, update, **_kwargs):
        document = next((doc for doc in self.documents if matches(doc, query)), None)
        if document is None:
            return None
        if "email" in update.get("$set", {}) and any(
            item is not document and item.get("email") == update["$set"]["email"]
            for item in self.documents
        ):
            raise DuplicateKeyError("duplicate email")
        self._apply(document, update)
        return copy.deepcopy(document)

    async def update_many(self, query, update):
        for document in self.documents:
            if matches(document, query):
                self._apply(document, update)

    async def update_one(self, query, update):
        document = next((doc for doc in self.documents if matches(doc, query)), None)
        if document is not None:
            self._apply(document, update)

    async def delete_many(self, query):
        self.documents = [doc for doc in self.documents if not matches(doc, query)]

    async def delete_one(self, query):
        document = next((doc for doc in self.documents if matches(doc, query)), None)
        if document is not None:
            self.documents.remove(document)
        return SimpleNamespace(deleted_count=int(document is not None))

    async def count_documents(self, query):
        return sum(matches(doc, query) for doc in self.documents)

    async def insert_one(self, document):
        document = copy.deepcopy(document)
        document["_id"] = ObjectId()
        self.documents.append(document)
        return SimpleNamespace(inserted_id=document["_id"])

    @staticmethod
    def _apply(document, update):
        for key, value in update.get("$set", {}).items():
            document[key] = value
        for key, value in update.get("$addToSet", {}).items():
            document.setdefault(key, [])
            if value not in document[key]:
                document[key].append(value)
        for key, value in update.get("$unset", {}).items():
            document.pop(key, None)
        for key, value in update.get("$pull", {}).items():
            document[key] = [item for item in document.get(key, []) if item != value]


def setup_db():
    company_id, other_company_id = ObjectId(), ObjectId()
    owner_id, member_id, foreign_id = ObjectId(), ObjectId(), ObjectId()
    project_id, member_project_id, creator_project_id, other_project_id = (
        ObjectId(),
        ObjectId(),
        ObjectId(),
        ObjectId(),
    )
    task_id, other_task_id = ObjectId(), ObjectId()
    database = SimpleNamespace(
        companies=Collection(
            [
                {"_id": company_id, "name": "Acme", "invite_code": "invite-a", "owner_id": owner_id},
                {"_id": other_company_id, "name": "Other", "invite_code": "invite-b"},
            ]
        ),
        users=Collection(
            [
                {"_id": owner_id, "company_id": company_id, "role": "owner", "display_name": "Owner", "email": "owner@example.com"},
                {"_id": member_id, "company_id": company_id, "role": "member", "display_name": "Member", "email": "member@example.com"},
                {"_id": foreign_id, "company_id": other_company_id, "role": "member", "display_name": "Foreign", "email": "foreign@example.com"},
            ]
        ),
        projects=Collection(
            [
                {"_id": project_id, "company_id": company_id, "member_ids": [owner_id, member_id], "created_by": member_id},
                {"_id": member_project_id, "company_id": company_id, "member_ids": [member_id], "created_by": owner_id},
                {"_id": creator_project_id, "company_id": company_id, "member_ids": [], "created_by": member_id},
                {"_id": other_project_id, "company_id": other_company_id, "member_ids": [foreign_id], "created_by": foreign_id},
            ]
        ),
        tasks=Collection(
            [
                {"_id": task_id, "company_id": company_id, "project_id": project_id, "assignee_id": member_id, "created_by": member_id},
                {"_id": other_task_id, "company_id": other_company_id, "project_id": other_project_id, "assignee_id": foreign_id, "created_by": foreign_id},
            ]
        ),
    )
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(database=database)))
    owner = {"_id": owner_id, "company_id": company_id, "role": "owner"}
    return database, request, owner, member_id, foreign_id


def invoke(coroutine):
    return asyncio.run(coroutine)


class TenantManagementTests(unittest.TestCase):
    def test_company_routes_require_owner_for_changes_and_scope_to_session_company(self):
        database, request, owner, _, _ = setup_db()
        member = {**owner, "role": "member"}
        self.assertEqual(invoke(get_company(request, owner)), {
            "id": str(owner["company_id"]),
            "name": "Acme",
            "invite_code": "invite-a",
        })

        updated = invoke(update_company(CompanyUpdate(name="  New name  "), request, owner))
        self.assertEqual(updated["name"], "New name")
        with self.assertRaises(HTTPException) as error:
            invoke(update_company(CompanyUpdate(name="Other"), request, member))
        self.assertEqual(error.exception.status_code, 403)
        with self.assertRaises(HTTPException) as error:
            invoke(update_company(CompanyUpdate(name="   "), request, owner))
        self.assertEqual(error.exception.status_code, 422)
        self.assertEqual(database.companies.documents[1]["name"], "Other")

    def test_company_delete_cascades_only_session_company(self):
        database, request, owner, _, _ = setup_db()
        response = invoke(delete_company(request, owner))
        self.assertEqual(response.status_code, 204)
        set_cookie = response.headers["set-cookie"]
        self.assertIn("tandem_session=", set_cookie)
        self.assertIn("Max-Age=0", set_cookie)
        self.assertIn("Path=/api", set_cookie)
        for collection in (database.tasks, database.projects, database.users):
            self.assertTrue(all(doc["company_id"] != owner["company_id"] for doc in collection.documents))
        self.assertNotIn(owner["company_id"], [doc["_id"] for doc in database.companies.documents])
        self.assertEqual(len(database.companies.documents), 1)

    def test_member_deletion_cleans_references_without_touching_other_company(self):
        database, request, owner, member_id, foreign_id = setup_db()
        invoke(delete_company_user(str(member_id), request, owner))
        project = database.projects.documents[0]
        task = database.tasks.documents[0]
        self.assertNotIn(member_id, project["member_ids"])
        self.assertEqual(project["created_by"], owner["_id"])
        self.assertEqual(database.projects.documents[1]["member_ids"], [owner["_id"]])
        self.assertEqual(database.projects.documents[2]["member_ids"], [owner["_id"]])
        self.assertNotIn(member_id, database.projects.documents[1]["member_ids"])
        self.assertNotIn(member_id, database.projects.documents[2]["member_ids"])
        self.assertNotIn("assignee_id", task)
        self.assertEqual(task["created_by"], owner["_id"])
        self.assertEqual(database.projects.documents[3]["member_ids"], [foreign_id])
        self.assertEqual(database.tasks.documents[1]["assignee_id"], foreign_id)
        self.assertIsNone(invoke(database.users.find_one({"_id": member_id})))

    def test_member_deletion_rejects_self_and_owner(self):
        database, request, owner, member_id, _ = setup_db()
        other_owner_id = ObjectId()
        database.users.documents.append(
            {"_id": other_owner_id, "company_id": owner["company_id"], "role": "owner"}
        )
        for protected_id in (owner["_id"], other_owner_id):
            with self.subTest(protected_id=protected_id), self.assertRaises(HTTPException) as error:
                invoke(delete_company_user(str(protected_id), request, owner))
            self.assertEqual(error.exception.status_code, 403)
        with self.assertRaises(HTTPException) as error:
            invoke(delete_company_user(str(member_id), request, {**owner, "role": "member"}))
        self.assertEqual(error.exception.status_code, 403)
        self.assertEqual(len(database.users.documents), 4)

    def test_user_update_normalizes_email_and_rejects_cross_company_target(self):
        database, request, owner, member_id, foreign_id = setup_db()
        updated = invoke(
            update_company_user(
                str(member_id),
                UserUpdate(email="  New.User@Example.COM  ", display_name="  New name "),
                request,
                owner,
            )
        )
        self.assertEqual(updated["email"], "new.user@example.com")
        self.assertEqual(updated["display_name"], "New name")
        with self.assertRaises(HTTPException) as error:
            invoke(update_company_user(str(foreign_id), UserUpdate(display_name="Intruder"), request, owner))
        self.assertEqual(error.exception.status_code, 404)
        self.assertEqual(invoke(database.users.find_one({"_id": foreign_id}))["display_name"], "Foreign")
        with self.assertRaises(HTTPException) as error:
            invoke(update_company_user(str(member_id), UserUpdate(display_name="Denied"), request, {**owner, "role": "member"}))
        self.assertEqual(error.exception.status_code, 403)
        with self.assertRaises(HTTPException) as error:
            invoke(update_company_user(str(member_id), UserUpdate(email="owner@example.com"), request, owner))
        self.assertEqual(error.exception.status_code, 409)
        with self.assertRaises(HTTPException) as error:
            invoke(update_company_user(str(member_id), UserUpdate(display_name="  "), request, owner))
        self.assertEqual(error.exception.status_code, 422)

    def test_create_project_and_task_persist_and_serialize_optional_fields(self):
        database, request, owner, _, _ = setup_db()
        project = invoke(
            create_project(
                ProjectCreate(name="  Plan  ", description="Project detail"),
                request,
                owner,
            )
        )
        persisted_project = invoke(database.projects.find_one({"_id": ObjectId(project["id"])}))
        self.assertEqual(project["description"], "Project detail")
        self.assertEqual(persisted_project["description"], "Project detail")
        updated_project = invoke(
            update_project(
                project["id"],
                ProjectUpdate(description="Updated project detail"),
                request,
                owner,
            )
        )
        self.assertEqual(updated_project["description"], "Updated project detail")

        payload = TaskCreate(
            title="  Ship  ",
            description="Task detail",
            due_at="2026-12-01T10:30:00Z",
        )
        due_at = datetime(2026, 12, 1, 10, 30, tzinfo=timezone.utc)
        task = invoke(
            create_task(
                project["id"],
                payload,
                request,
                owner,
            )
        )
        persisted_task = invoke(database.tasks.find_one({"_id": ObjectId(task["id"])}))
        self.assertEqual(task["description"], "Task detail")
        self.assertEqual(task["due_at"], "2026-12-01T10:30:00+00:00")
        self.assertEqual(persisted_task["due_at"], due_at)
        persisted_task["due_at"] = datetime(2026, 12, 1, 10, 30)
        task_with_naive_due_at = invoke(
            update_task(
                project["id"],
                task["id"],
                TaskUpdate(description="Updated task detail"),
                request,
                owner,
            )
        )
        self.assertEqual(task_with_naive_due_at["due_at"], "2026-12-01T10:30:00+00:00")
        updated_task = invoke(
            update_task(
                project["id"],
                task["id"],
                TaskUpdate(description=None, due_at=None),
                request,
                owner,
            )
        )
        self.assertIsNone(updated_task["description"])
        self.assertIsNone(updated_task["due_at"])
        self.assertIsNone(invoke(database.tasks.find_one({"_id": ObjectId(task["id"])}))["due_at"])


if __name__ == "__main__":
    unittest.main()
