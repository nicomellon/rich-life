from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

from app.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "dev"}


def test_docs_are_served() -> None:
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").status_code == 200


def test_cors_allows_configured_origin() -> None:
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


class SchemaReference(BaseModel):
    ref: str | None = Field(default=None, alias="$ref")


class DocumentedContent(BaseModel):
    schema_: SchemaReference = Field(alias="schema")


class DocumentedResponse(BaseModel):
    content: dict[str, DocumentedContent] = {}


class DocumentedOperation(BaseModel):
    responses: dict[str, DocumentedResponse]


class OpenAPIDocument(BaseModel):
    """The part of `/openapi.json` that documents the responses."""

    paths: dict[str, dict[str, DocumentedOperation]]


ERROR_RESPONSE_REF = "#/components/schemas/ErrorResponse"


def response_schema_ref(documented_response: DocumentedResponse) -> str | None:
    return documented_response.content["application/json"].schema_.ref


def read_openapi_document() -> OpenAPIDocument:
    return OpenAPIDocument.model_validate(client.get("/openapi.json").json())


def test_openapi_documents_the_month_conflict_as_an_error_response() -> None:
    openapi_document = read_openapi_document()

    month_creation = openapi_document.paths["/api/v1/months"]["post"]
    assert response_schema_ref(month_creation.responses["409"]) == ERROR_RESPONSE_REF


def test_openapi_documents_every_422_as_an_error_response() -> None:
    openapi_document = read_openapi_document()

    assert {
        response_schema_ref(operation.responses["422"])
        for path_operations in openapi_document.paths.values()
        for operation in path_operations.values()
        if "422" in operation.responses
    } == {ERROR_RESPONSE_REF}
