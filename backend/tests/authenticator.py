"""A software WebAuthn authenticator, so tests can register and sign in with real
passkeys: it answers the same options, with the same credentials, as a browser's
navigator.credentials.create() and .get()."""

import hashlib
import secrets
import struct
from typing import Literal, TypedDict

import cbor2
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from pydantic import BaseModel
from webauthn.helpers.structs import AuthenticatorAttachment

from app.core.config import get_settings
from app.schemas.webauthn import (
    AssertionResponse,
    AttestationResponse,
    AuthenticationOptions,
    AuthenticationResponse,
    Base64URLBytes,
    RegistrationOptions,
    RegistrationResponse,
)


class ClientData(BaseModel):
    """The clientDataJSON a browser builds for each ceremony."""

    type: Literal["webauthn.create", "webauthn.get"]
    challenge: Base64URLBytes
    origin: str


class AttestationObject(TypedDict):
    """The CBOR map an authenticator returns from registration. A TypedDict, because
    cbor2 encodes dicts."""

    fmt: Literal["none"]
    # The attestation statement; empty for "none" attestation.
    attStmt: dict[str, bytes]
    authData: bytes


# Authenticator data flags: user present, user verified, attested credential data
# included.
USER_PRESENT = 0x01
USER_VERIFIED = 0x04
ATTESTED_CREDENTIAL_DATA = 0x40


class SoftwareAuthenticator:
    """Holds one ES256 (P-256) credential, like a passkey saved on a single device."""

    def __init__(self, origin: str | None = None) -> None:
        settings = get_settings()
        self.rp_id = settings.webauthn_rp_id
        self.origin = origin or settings.webauthn_origin
        self.credential_id = secrets.token_bytes(16)
        self.private_key = ec.generate_private_key(ec.SECP256R1())
        self.user_handle: bytes | None = None
        self.sign_count = 0

    def create(self, options: RegistrationOptions) -> RegistrationResponse:
        """Answer creation options with a new credential, using "none" attestation."""
        self.user_handle = options.user.id
        attestation_object = cbor2.dumps(
            AttestationObject(
                fmt="none",
                attStmt={},
                authData=self._registration_authenticator_data(),
            )
        )
        return RegistrationResponse(
            id=self.credential_id,
            raw_id=self.credential_id,
            type="public-key",
            response=AttestationResponse(
                client_data_json=self._client_data(
                    "webauthn.create", options.challenge
                ),
                attestation_object=attestation_object,
                transports=["internal"],
            ),
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,
        )

    def get(
        self, options: AuthenticationOptions | RegistrationOptions
    ) -> AuthenticationResponse:
        """Answer request options with a signed assertion. Registration options are
        accepted too, so tests can answer the wrong kind of challenge."""
        self.sign_count += 1
        client_data = self._client_data("webauthn.get", options.challenge)
        authenticator_data = (
            self._rp_id_hash()
            + bytes([USER_PRESENT | USER_VERIFIED])
            + struct.pack(">I", self.sign_count)
        )
        signature = self.private_key.sign(
            authenticator_data + hashlib.sha256(client_data).digest(),
            ec.ECDSA(hashes.SHA256()),
        )
        return AuthenticationResponse(
            id=self.credential_id,
            raw_id=self.credential_id,
            type="public-key",
            response=AssertionResponse(
                client_data_json=client_data,
                authenticator_data=authenticator_data,
                signature=signature,
                user_handle=self.user_handle,
            ),
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,
        )

    def _client_data(
        self, ceremony: Literal["webauthn.create", "webauthn.get"], challenge: bytes
    ) -> bytes:
        client_data = ClientData(
            type=ceremony,
            challenge=challenge,
            origin=self.origin,
        )
        return client_data.model_dump_json().encode()

    def _rp_id_hash(self) -> bytes:
        return hashlib.sha256(self.rp_id.encode()).digest()

    def _registration_authenticator_data(self) -> bytes:
        public_numbers = self.private_key.public_key().public_numbers()
        # COSE_Key for ES256: kty EC2 (2), alg ES256 (-7), crv P-256 (1), then the x and
        # y coordinates.
        cose_key = cbor2.dumps(
            {
                1: 2,
                3: -7,
                -1: 1,
                -2: public_numbers.x.to_bytes(32, "big"),
                -3: public_numbers.y.to_bytes(32, "big"),
            }
        )
        attested_credential_data = (
            bytes(16)  # AAGUID: all zeros, an unidentified authenticator
            + struct.pack(">H", len(self.credential_id))
            + self.credential_id
            + cose_key
        )
        return (
            self._rp_id_hash()
            + bytes([USER_PRESENT | USER_VERIFIED | ATTESTED_CREDENTIAL_DATA])
            + struct.pack(">I", 0)
            + attested_credential_data
        )
