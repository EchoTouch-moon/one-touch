from typing import Dict, Type

from backend.srs.base import BaseSRS, SRSConfig, SRSResult, SRSState
from backend.srs.sm2 import SM2Algorithm

SRS_REGISTRY: Dict[str, Type[BaseSRS]] = {
    "sm2": SM2Algorithm,
}


def SRSFactory(name: str = "sm2") -> BaseSRS:
    cls = SRS_REGISTRY.get(name)
    if cls is None:
        raise ValueError(f"Unknown SRS algorithm: {name}")
    return cls()


__all__ = ["BaseSRS", "SRSConfig", "SRSResult", "SRSState", "SRSFactory", "SM2Algorithm"]
