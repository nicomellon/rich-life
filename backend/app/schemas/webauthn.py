"""WebAuthn options and credentials in the JSON shapes of the browser API
(PublicKeyCredentialCreationOptionsJSON, RegistrationResponseJSON and so on), which
@simplewebauthn/browser consumes and produces. Binary values travel as unpadded base64url strings
and are bytes in Python."""

import base64
import binascii
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, PlainSerializer, WithJsonSchema
from pydantic.alias_generators import to_camel
from webauthn.helpers import bytes_to_base64url
from webauthn.helpers.structs import (
    AuthenticatorAttachment,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)


def _decode_base64url(value: object) -> object:
    """Decode unpadded base64url strictly; py_webauthn's base64url_to_bytes silently drops invalid
    characters. Bytes pass through, so models can also be built in Python."""
    if not isinstance(value, str):
        return value
    padded = value + "=" * (-len(value) % 4)
    try:
        return base64.b64decode(padded, altchars=b"-_", validate=True)
    except binascii.Error as exc:
        raise ValueError("Invalid base64url") from exc


Base64URLBytes = Annotated[
    bytes,
    BeforeValidator(_decode_base64url),
    PlainSerializer(bytes_to_base64url, return_type=str),
    WithJsonSchema({"type": "string", "format": "base64url"}),
]


class WebAuthnModel(BaseModel):
    """camelCase in JSON, snake_case in Python."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
    )


class CredentialDescriptor(WebAuthnModel):
    id: Base64URLBytes
    type: Literal["public-key"] = "public-key"
    transports: list[str] = []


# Options sent to the browser


class RelyingParty(WebAuthnModel):
    id: str
    name: str


class UserEntity(WebAuthnModel):
    id: Base64URLBytes
    name: str
    display_name: str


class CredentialParameters(WebAuthnModel):
    type: Literal["public-key"]
    # COSE algorithm identifier, e.g. -7 for ES256.
    alg: int


class AuthenticatorSelection(WebAuthnModel):
    resident_key: ResidentKeyRequirement
    require_resident_key: bool
    user_verification: UserVerificationRequirement
    authenticator_attachment: AuthenticatorAttachment | None = None


class RegistrationOptions(WebAuthnModel):
    """For `navigator.credentials.create()`."""

    rp: RelyingParty
    user: UserEntity
    challenge: Base64URLBytes
    pub_key_cred_params: list[CredentialParameters]
    timeout: int
    exclude_credentials: list[CredentialDescriptor] = []
    authenticator_selection: AuthenticatorSelection
    attestation: Literal["none", "indirect", "direct", "enterprise"]


class AuthenticationOptions(WebAuthnModel):
    """For `navigator.credentials.get()`."""

    challenge: Base64URLBytes
    timeout: int
    rp_id: str
    allow_credentials: list[CredentialDescriptor] = []
    user_verification: UserVerificationRequirement


# Credentials returned by the browser


class CredentialProperties(WebAuthnModel):
    # Whether the authenticator created a discoverable credential, when it says.
    rk: bool | None = None


class ClientExtensionResults(WebAuthnModel):
    cred_props: CredentialProperties | None = None


class AttestationResponse(WebAuthnModel):
    client_data_json: Base64URLBytes = Field(alias="clientDataJSON")
    attestation_object: Base64URLBytes
    # Unknown values are kept here and ignored later, since browsers may add new transports.
    transports: list[str] = []


class RegistrationResponse(WebAuthnModel):
    """What `navigator.credentials.create()` returns."""

    id: str
    raw_id: Base64URLBytes
    type: Literal["public-key"]
    response: AttestationResponse
    authenticator_attachment: AuthenticatorAttachment | None = None
    client_extension_results: ClientExtensionResults = ClientExtensionResults()


class AssertionResponse(WebAuthnModel):
    client_data_json: Base64URLBytes = Field(alias="clientDataJSON")
    authenticator_data: Base64URLBytes
    signature: Base64URLBytes
    user_handle: Base64URLBytes | None = None


class AuthenticationResponse(WebAuthnModel):
    """What `navigator.credentials.get()` returns."""

    id: str
    raw_id: Base64URLBytes
    type: Literal["public-key"]
    response: AssertionResponse
    authenticator_attachment: AuthenticatorAttachment | None = None
    client_extension_results: ClientExtensionResults = ClientExtensionResults()
