from backend.srs.base import BaseSRS, SRSConfig, SRSResult, SRSState


class SM2Algorithm(BaseSRS):
    def calculate(self, state: SRSState, quality: int, config: SRSConfig) -> SRSResult:
        ef = state.ease_factor
        interval = state.interval_days
        reps = state.repetitions

        if quality >= 3:
            # Correct response
            if reps == 0:
                interval = 1
            elif reps == 1:
                interval = 6
            else:
                interval = round(interval * ef)
            reps += 1
            # Update ease factor
            ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        else:
            # Incorrect response — reset
            reps = 0
            interval = 1

        # Clamp ease factor
        ef = max(ef, config.min_ease_factor)

        return SRSResult(
            new_state=SRSState(ease_factor=round(ef, 2), interval_days=interval, repetitions=reps),
            next_interval_days=interval,
        )
