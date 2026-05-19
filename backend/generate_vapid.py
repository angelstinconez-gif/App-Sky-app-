"""
Genera un par de claves VAPID para Web Push.
Uso:  python generate_vapid.py
Pega las claves en las variables de entorno VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY.
"""
import base64

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")


def main():
    private_key = ec.generate_private_key(ec.SECP256R1(), default_backend())
    public_key = private_key.public_key()

    # Clave pública en formato uncompressed (65 bytes empezando en 0x04)
    public_numbers = public_key.public_numbers()
    public_bytes = b"\x04" + public_numbers.x.to_bytes(32, "big") + public_numbers.y.to_bytes(32, "big")
    public_b64 = b64url(public_bytes)

    # Clave privada en PEM (el formato que espera pywebpush)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("ascii")

    print("\n══════════════════════════════════════════════════════════")
    print("  CLAVES VAPID GENERADAS — guárdalas en tus envVars")
    print("══════════════════════════════════════════════════════════\n")
    print(f"VAPID_PUBLIC_KEY={public_b64}\n")
    print("VAPID_PRIVATE_KEY (multilínea, copia todo entre las líneas):")
    print("─" * 60)
    print(private_pem.strip())
    print("─" * 60)
    print("\nVAPID_EMAIL=mailto:admin@skyenergy.mx\n")
    print("Tip Render: en 'Environment', pega VAPID_PRIVATE_KEY como")
    print("            valor multilínea (Render lo soporta).\n")


if __name__ == "__main__":
    main()
