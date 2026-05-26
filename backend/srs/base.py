from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class SRSConfig:
    min_ease_factor: float = 1.3
    default_ease_factor: float = 2.5
    target_retrievability: float = 0.9


@dataclass(frozen=True)
class SRSState:
    ease_factor: float
    interval_days: int
    repetitions: int
    difficulty: float | None = None
    stability: float | None = None
    retrievability: float | None = None
    scheduled_days: int | None = None
    elapsed_days: float | None = None


@dataclass(frozen=True)
class SRSResult:
    new_state: SRSState
    next_interval_days: int
    scheduled_days: int | None = None


class BaseSRS(ABC):
    @abstractmethod
    def calculate(self, state: SRSState, quality: int, config: SRSConfig) -> SRSResult:
        ...
