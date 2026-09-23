"""A software WebAuthn authenticator, so tests can register and sign in with real passkeys: it produces the same
JSON a browser returns from navigator.credentials.create() and .get() (as serialized by @simplewebauthn/browser)."""

import hashlib
import json
import secrets
import struct
from typing import Any

import cbor2
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url

from app.core.config import get_settings

# Authenticator data flags: user present, user verified, attested credential data included.
UP, UV, AT = 0x01, 0x04, 0x40


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

    def create(self, options: dict[str, Any]) -> dict[str, Any]:
        """Answer creation options with a new credential (RegistrationResponseJSON), using "none" attestation."""
        self.user_handle = base64url_to_bytes(options["user"]["id"])
        client_data = self._client_data("webauthn.create", options["challenge"])
        attestation_object = cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": self._registration_auth_data()})
        credential_id = bytes_to_base64url(self.credential_id)
        return {
            "id": credential_id,
            "rawId": credential_id,
            "type": "public-key",
            "response": {
                "clientDataJSON": bytes_to_base64url(client_data),
                "attestationObject": bytes_to_base64url(attestation_object),
                "transports": ["internal"],
            },
            "authenticatorAttachment": "platform",
            "clientExtensionResults": {},
        }

    def get(self, options: dict[str, Any]) -> dict[str, Any]:
        """Answer request options with a signed assertion (AuthenticationResponseJSON)."""
        self.sign_count += 1
        client_data = self._client_data("webauthn.get", options["challenge"])
        auth_data = self._rp_id_hash() + bytes([UP | UV]) + struct.pack(">I", self.sign_count)
        signature = self.private_key.sign(auth_data + hashlib.sha256(client_data).digest(), ec.ECDSA(hashes.SHA256()))
        credential_id = bytes_to_base64url(self.credential_id)
        return {
            "id": credential_id,
            "rawId": credential_id,
            "type": "public-key",
            "response": {
                "clientDataJSON": bytes_to_base64url(client_data),
                "authenticatorData": bytes_to_base64url(auth_data),
                "signature": bytes_to_base64url(signature),
                "userHandle": bytes_to_base64url(self.user_handle) if self.user_handle else None,
            },
            "authenticatorAttachment": "platform",
            "clientExtensionResults": {},
        }

    def _client_data(self, ceremony: str, challenge: str) -> bytes:
        return json.dumps({"type": ceremony, "challenge": challenge, "origin": self.origin}).encode()

    def _rp_id_hash(self) -> bytes:
        return hashlib.sha256(self.rp_id.encode()).digest()

    def _registration_auth_data(self) -> bytes:
        numbers = self.private_key.public_key().public_numbers()
        # COSE_Key for ES256: kty EC2 (2), alg ES256 (-7), crv P-256 (1), then the x and y coordinates.
        cose_key = cbor2.dumps(
            {1: 2, 3: -7, -1: 1, -2: numbers.x.to_bytes(32, "big"), -3: numbers.y.to_bytes(32, "big")}
        )
        attested_credential_data = (
            bytes(16)  # AAGUID: all zeros, an unidentified authenticator
            + struct.pack(">H", len(self.credential_id))
            + self.credential_id
            + cose_key
        )
        return self._rp_id_hash() + bytes([UP | UV | AT]) + struct.pack(">I", 0) + attested_credential_data
