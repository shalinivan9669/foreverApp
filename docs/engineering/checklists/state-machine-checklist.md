# State Machine Checklist

- [ ] Entity states are defined in `docs/03-state-machines.md`.
- [ ] Allowed transitions are centralized in one machine module.
- [ ] Guards are shared and reused by all routes/services touching this state.
- [ ] Invalid transition returns `STATE_CONFLICT` (`409`) with consistent details.
- [ ] No route contains ad-hoc status strings that duplicate machine logic.
- [ ] Any new state/transition has tests or evidence and docs update.
