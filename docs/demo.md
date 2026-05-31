# Demo script + timings (fill in as we build)

## One-line pitch
An autonomous agent that catches PRs breaking your team's security rules, fixes the code, proves it with tests, and merges — with judgment about when NOT to act.

## Sequence (~3 min)
1. Open PR A (real) live. Detect -> fix -> a test FAILS (show red) -> self-correct -> green -> merge -> receipt -> Slack ping. (hero moment = self-correction)
2. Open PR B (decoy). Everyone expects a catch. Agent ALLOWS it: "it's test data." (judgment moment)
3. Optional: confidence gate escalates an ambiguous case to a human.
4. Timer: human ~25 min vs agent under a minute. Nobody touched a keyboard.

## Backup
- Manual backup button to fire the loop if the webhook hiccups.
- Pre-recorded video of the full flow as last resort.

## Narrator
A confident speaker drives the talk while the screen runs. (Decide on the day.)
