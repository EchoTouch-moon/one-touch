from __future__ import annotations

import math

from backend.srs.base import BaseSRS, SRSConfig, SRSResult, SRSState


def _quality_to_rating(quality: int) -> int:
    if quality <= 1:
        return 1
    if quality == 2:
        return 2
    if quality == 5:
        return 4
    return 3


class FSRSAlgorithm(BaseSRS):
    """A compact FSRS-style scheduler for D/S/R state without user training."""

    def calculate(self, state: SRSState, quality: int, config: SRSConfig) -> SRSResult:
        rating = _quality_to_rating(quality)
        difficulty = state.difficulty if state.difficulty is not None else 5.0
        stability = state.stability if state.stability is not None else 0.0
        elapsed_days = max(state.elapsed_days or 0.0, 0.0)

        if stability > 0:
            retrievability = math.pow(1 + elapsed_days / (9 * stability), -1)
        else:
            retrievability = 0.0

        if stability <= 0:
            initial_stability = {1: 0.1, 2: 0.4, 3: 1.0, 4: 3.0}
            stability = initial_stability[rating]
            difficulty = {1: 7.0, 2: 6.0, 3: 5.0, 4: 4.0}[rating]
        elif rating == 1:
            difficulty = min(10.0, difficulty + 1.0)
            stability = max(0.1, stability * 0.35)
        else:
            difficulty_delta = {2: 0.35, 3: -0.15, 4: -0.45}[rating]
            stability_gain = {2: 1.15, 3: 1.75, 4: 2.35}[rating]
            difficulty = min(10.0, max(1.0, difficulty + difficulty_delta))
            difficulty_penalty = max(0.35, 1.0 - (difficulty - 5.0) * 0.04)
            recall_bonus = max(0.4, 1.0 + (1.0 - retrievability) * 0.6)
            stability = max(0.1, stability * stability_gain * difficulty_penalty * recall_bonus)

        target = min(max(config.target_retrievability, 0.7), 0.98)
        scheduled_days = max(1, round(9 * stability * (1 / target - 1)))
        new_state = SRSState(
            ease_factor=state.ease_factor,
            interval_days=scheduled_days,
            repetitions=state.repetitions + (0 if rating == 1 else 1),
            difficulty=round(difficulty, 4),
            stability=round(stability, 4),
            retrievability=round(retrievability, 4),
            scheduled_days=scheduled_days,
            elapsed_days=elapsed_days,
        )
        return SRSResult(
            new_state=new_state,
            next_interval_days=scheduled_days,
            scheduled_days=scheduled_days,
        )
