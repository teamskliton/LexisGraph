import hashlib


def generate_content_hash(file_bytes: bytes, algorithm: str = "sha256") -> str:
    """Generate deterministic hash from raw file bytes."""
    hasher = hashlib.new(algorithm)
    hasher.update(file_bytes)
    return hasher.hexdigest()


def generate_file_hash(file_path: str, algorithm: str = "sha256") -> str:
    """Generate deterministic hash for a file using a selected algorithm."""
    hasher = hashlib.new(algorithm)

    with open(file_path, "rb") as file_obj:
        for chunk in iter(lambda: file_obj.read(8192), b""):
            hasher.update(chunk)

    return hasher.hexdigest()
