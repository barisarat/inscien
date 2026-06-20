import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "fastapi-error-handling-responses",
  kind: "codenote",
  name: "FastAPI Error Handling and API Responses",
  desc: "A Docker based FastAPI project that uses custom exceptions, global exception handlers, validation error shaping, and consistent API response contracts.",
  intro:
    "This setup creates a focused FastAPI error handling project. It separates success responses from error responses, uses custom exception classes for domain errors, handles validation errors consistently, and returns predictable JSON shapes for client applications.",
  sections: [
    {
      title: "Project structure",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a separate project folder for the error handling example. This project keeps exceptions, handlers, schemas, and routes in separate files.",
          ],
        },
        {
          kind: "code",
          code: `08-error-handling-responses/
  app/
    __init__.py
    exceptions.py
    handlers.py
    main.py
    schemas.py
    store.py
  requirements.txt
  Dockerfile
  compose.yaml`,
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir 08-error-handling-responses
cd 08-error-handling-responses
mkdir app
touch app/__init__.py`,
        },
      ],
    },
    {
      title: "Create response schemas",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the response schema file at app/schemas.py. These schemas document the normal API response shape and the error response shape.",
          ],
        },
        {
          kind: "code",
          code: `app/schemas.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    email: str = Field(min_length=3, max_length=120)


class UserUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=1, max_length=50)
    email: str | None = Field(default=None, min_length=3, max_length=120)


class UserResponse(BaseModel):
    id: int
    username: str
    email: str


class ErrorResponse(BaseModel):
    error_code: str
    message: str
    details: dict | list | None = None


class SuccessResponse(BaseModel):
    message: str`,
        },
        {
          kind: "text",
          text: [
            "ErrorResponse gives the frontend a stable shape. The client can display message, inspect error_code, and optionally use details for field level validation feedback.",
          ],
        },
      ],
    },
    {
      title: "Create custom exceptions",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the custom exception file at app/exceptions.py. These classes represent domain errors that the route layer can raise without repeating HTTP response details everywhere.",
          ],
        },
        {
          kind: "code",
          code: `app/exceptions.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `class AppError(Exception):
    status_code = 500
    error_code = "internal_error"
    message = "Internal server error"

    def __init__(self, message=None, details=None):
        self.message = message or self.message
        self.details = details


class UserNotFoundError(AppError):
    status_code = 404
    error_code = "user_not_found"
    message = "User not found"


class UserAlreadyExistsError(AppError):
    status_code = 409
    error_code = "user_already_exists"
    message = "Username or email already exists"


class ForbiddenActionError(AppError):
    status_code = 403
    error_code = "forbidden_action"
    message = "This action is not allowed"


class InvalidOperationError(AppError):
    status_code = 400
    error_code = "invalid_operation"
    message = "Invalid operation"`,
        },
        {
          kind: "text",
          text: [
            "The custom exceptions keep business meaning separate from the HTTP formatting. The handler later converts these exceptions into JSON responses.",
          ],
        },
      ],
    },
    {
      title: "Create an in-memory store",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the store file at app/store.py. This keeps the example focused on error handling instead of database setup.",
          ],
        },
        {
          kind: "code",
          code: `app/store.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `users = {}
next_user_id = 1


def create_user(payload):
    global next_user_id

    user = {
        "id": next_user_id,
        "username": payload.username,
        "email": payload.email,
    }

    users[next_user_id] = user
    next_user_id += 1

    return user


def list_users():
    return list(users.values())


def get_user(user_id):
    return users.get(user_id)


def update_user(user_id, update_data):
    user = users.get(user_id)

    if not user:
        return None

    user.update(update_data)

    return user


def delete_user(user_id):
    return users.pop(user_id, None)


def username_or_email_exists(username, email):
    return any(
        user["username"] == username or user["email"] == email
        for user in users.values()
    )`,
        },
        {
          kind: "text",
          text: [
            "A real application would replace this file with SQLAlchemy queries, but the error handling pattern stays the same.",
          ],
        },
      ],
    },
    {
      title: "Create exception handlers",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the exception handler file at app/handlers.py. These handlers convert custom exceptions, HTTP exceptions, validation errors, and unexpected exceptions into predictable JSON responses.",
          ],
        },
        {
          kind: "code",
          code: `app/handlers.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.exceptions import AppError


async def app_error_handler(_request: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error_code": exc.error_code,
            "message": exc.message,
            "details": exc.details,
        },
    )


async def http_error_handler(_request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error_code": "http_error",
            "message": exc.detail,
            "details": None,
        },
    )


async def validation_error_handler(_request: Request, exc: RequestValidationError):
    field_errors = []

    for error in exc.errors():
        field_errors.append(
            {
                "field": ".".join(str(item) for item in error["loc"]),
                "message": error["msg"],
                "type": error["type"],
            }
        )

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error_code": "validation_error",
            "message": "Request validation failed",
            "details": field_errors,
        },
    )


async def unhandled_error_handler(_request: Request, _exc: Exception):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error_code": "internal_error",
            "message": "Internal server error",
            "details": None,
        },
    )`,
        },
        {
          kind: "text",
          text: [
            "The unhandled exception handler avoids leaking internal stack traces to the client. Server logs should still capture the real traceback in a production setup.",
          ],
        },
      ],
    },
    {
      title: "Create the FastAPI app",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the main application file at app/main.py. This file registers the exception handlers and defines routes that raise domain errors when something fails.",
          ],
        },
        {
          kind: "code",
          code: `app/main.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `from fastapi import FastAPI, HTTPException, Response, status
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import store
from app.exceptions import (
    AppError,
    ForbiddenActionError,
    InvalidOperationError,
    UserAlreadyExistsError,
    UserNotFoundError,
)
from app.handlers import (
    app_error_handler,
    http_error_handler,
    unhandled_error_handler,
    validation_error_handler,
)
from app.schemas import ErrorResponse, SuccessResponse, UserCreate, UserResponse, UserUpdate

app = FastAPI(title="08 Error Handling Responses")

app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(StarletteHTTPException, http_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_exception_handler(Exception, unhandled_error_handler)


@app.get("/")
def home():
    return {
        "message": "FastAPI error handling example"
    }


@app.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        409: {
            "model": ErrorResponse
        },
        422: {
            "model": ErrorResponse
        },
    },
)
def create_user(payload: UserCreate):
    if store.username_or_email_exists(payload.username, payload.email):
        raise UserAlreadyExistsError()

    return store.create_user(payload)


@app.get("/users", response_model=list[UserResponse])
def list_users():
    return store.list_users()


@app.get(
    "/users/{user_id}",
    response_model=UserResponse,
    responses={
        404: {
            "model": ErrorResponse
        },
    },
)
def get_user(user_id: int):
    user = store.get_user(user_id)

    if not user:
        raise UserNotFoundError()

    return user


@app.patch(
    "/users/{user_id}",
    response_model=UserResponse,
    responses={
        400: {
            "model": ErrorResponse
        },
        404: {
            "model": ErrorResponse
        },
        422: {
            "model": ErrorResponse
        },
    },
)
def update_user(user_id: int, payload: UserUpdate):
    update_data = payload.model_dump(exclude_unset=True)

    if not update_data:
        raise InvalidOperationError(
            message="At least one field must be provided",
        )

    user = store.update_user(user_id, update_data)

    if not user:
        raise UserNotFoundError()

    return user


@app.delete(
    "/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        403: {
            "model": ErrorResponse
        },
        404: {
            "model": ErrorResponse
        },
    },
)
def delete_user(user_id: int):
    if user_id == 1:
        raise ForbiddenActionError(
            message="The first user cannot be deleted in this example",
        )

    user = store.delete_user(user_id)

    if not user:
        raise UserNotFoundError()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get(
    "/manual-http-error",
    responses={
        418: {
            "model": ErrorResponse
        },
    },
)
def manual_http_error():
    raise HTTPException(
        status_code=418,
        detail="Manual HTTP exception example",
    )


@app.get(
    "/crash",
    responses={
        500: {
            "model": ErrorResponse
        },
    },
)
def crash():
    raise RuntimeError("Simulated unexpected crash")`,
        },
        {
          kind: "text",
          text: [
            "The responses argument improves the generated OpenAPI documentation by showing which error response model can be returned from each route.",
          ],
        },
      ],
    },
    {
      title: "Add dependencies",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the dependency file at requirements.txt. This example only needs FastAPI and Uvicorn.",
          ],
        },
        {
          kind: "code",
          code: `requirements.txt`,
        },
        {
          kind: "code",
          code: `fastapi
uvicorn[standard]`,
        },
      ],
    },
    {
      title: "Create the Dockerfile",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the Dockerfile at the project root. The container owns the Python environment and runs the FastAPI app with Uvicorn.",
          ],
        },
        {
          kind: "code",
          code: `Dockerfile`,
        },
        {
          kind: "code",
          code: `FROM python:3.12-slim

WORKDIR /app

RUN python -m venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .

RUN pip install --upgrade pip
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]`,
        },
      ],
    },
    {
      title: "Create the Compose file",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the Docker Compose file at compose.yaml. The source folder is mounted into the container so code changes reload during development.",
          ],
        },
        {
          kind: "code",
          code: `compose.yaml`,
        },
        {
          kind: "code",
          code: `services:
  backend:
    build: .
    container_name: fastapi-08-error-handling-responses
    ports:
      - "8000:8000"
    volumes:
      - .:/app`,
        },
      ],
    },
    {
      title: "Run the project",
      blocks: [
        {
          kind: "text",
          text: [
            "Run Docker Compose from inside the project folder.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose up --build`,
        },
        {
          kind: "text",
          text: [
            "Open the API docs page to inspect the success and error response models.",
          ],
        },
        {
          kind: "code",
          code: `http://localhost:8000/docs`,
        },
      ],
    },
    {
      title: "Test success response",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a user through POST /users. The successful response follows UserResponse.",
          ],
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "username": "baris",
  "email": "baris@example.com"
}`,
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "id": 1,
  "username": "baris",
  "email": "baris@example.com"
}`,
        },
      ],
    },
    {
      title: "Test conflict error",
      blocks: [
        {
          kind: "text",
          text: [
            "Send the same user again through POST /users. The custom UserAlreadyExistsError becomes a 409 response.",
          ],
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "error_code": "user_already_exists",
  "message": "Username or email already exists",
  "details": null
}`,
        },
      ],
    },
    {
      title: "Test not found error",
      blocks: [
        {
          kind: "text",
          text: [
            "Open a missing user. The custom UserNotFoundError becomes a 404 response.",
          ],
        },
        {
          kind: "code",
          code: `http://localhost:8000/users/999`,
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "error_code": "user_not_found",
  "message": "User not found",
  "details": null
}`,
        },
      ],
    },
    {
      title: "Test validation error",
      blocks: [
        {
          kind: "text",
          text: [
            "Send an invalid request body. FastAPI raises RequestValidationError before the route logic runs, and the custom validation handler returns a consistent shape.",
          ],
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "username": "",
  "email": ""
}`,
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "error_code": "validation_error",
  "message": "Request validation failed",
  "details": [
    {
      "field": "body.username",
      "message": "String should have at least 1 character",
      "type": "string_too_short"
    },
    {
      "field": "body.email",
      "message": "String should have at least 3 characters",
      "type": "string_too_short"
    }
  ]
}`,
        },
      ],
    },
    {
      title: "Test forbidden error",
      blocks: [
        {
          kind: "text",
          text: [
            "Delete user 1. This example blocks deleting the first user and returns a 403 error.",
          ],
        },
        {
          kind: "code",
          code: `DELETE /users/1`,
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "error_code": "forbidden_action",
  "message": "The first user cannot be deleted in this example",
  "details": null
}`,
        },
      ],
    },
    {
      title: "Test manual HTTP exception",
      blocks: [
        {
          kind: "text",
          text: [
            "Open the manual HTTP error route. The global HTTP exception handler converts normal HTTPException output into the same error response shape.",
          ],
        },
        {
          kind: "code",
          code: `http://localhost:8000/manual-http-error`,
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "error_code": "http_error",
  "message": "Manual HTTP exception example",
  "details": null
}`,
        },
      ],
    },
    {
      title: "Test unexpected error",
      blocks: [
        {
          kind: "text",
          text: [
            "Open the crash route. The global unhandled error handler returns a generic 500 response without exposing the internal exception message.",
          ],
        },
        {
          kind: "code",
          code: `http://localhost:8000/crash`,
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "error_code": "internal_error",
  "message": "Internal server error",
  "details": null
}`,
        },
      ],
    },
    {
      title: "Error response rules",
      blocks: [
        {
          kind: "text",
          text: [
            "A good API should make error responses predictable. Frontend clients should not need to handle many unrelated error shapes.",
          ],
        },
        {
          kind: "code",
          code: `Use 400
  request is valid JSON but operation is invalid

Use 401
  authentication is missing or invalid

Use 403
  authenticated user is not allowed

Use 404
  requested resource does not exist

Use 409
  request conflicts with existing state

Use 422
  request body, path, or query validation failed

Use 500
  unexpected server failure`,
        },
      ],
    },
    {
      title: "Mental model",
      blocks: [
        {
          kind: "text",
          text: [
            "The route layer should raise meaningful errors. The handler layer should format those errors. This keeps route code clean and makes API clients easier to build.",
          ],
        },
        {
          kind: "code",
          code: `Route function
  raises domain exception

Custom exception
  stores status_code, error_code, message, details

Global handler
  converts exception into JSONResponse

ErrorResponse
  documents the response shape

Frontend client
  reads error_code and message consistently`,
        },
      ],
    },
    {
      title: "Stop the project",
      blocks: [
        {
          kind: "text",
          text: [
            "Stop the running container from the active Docker Compose terminal or shut it down from another terminal.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Press this in the running terminal
CTRL + C

# Or run this from another terminal
docker compose down`,
        },
      ],
    },
  ],
}

export default entry