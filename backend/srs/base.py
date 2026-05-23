from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class SRSConfig:
    min_ease_factor: float = 1.3
    default_ease_factor: float = 2.5


@dataclass(frozen=True)
class SRSState:
    ease_factor: float
    interval_days: int
    repetitions: int


@dataclass(frozen=True)
class SRSResult:
    new_state: SRSState
    next_interval_days: int


class BaseSRS(ABC):
    @abstractmethod
    def calculate(self, state: SRSState, quality: int, config: SRSConfig) -> SRSResult:
        ...
