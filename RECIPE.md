# Recipe: the docker kit

## What it answers

Which containers run, are unhealthy or keep restarting; why one container fails; what a compose project holds; which ports are published and by what; what uses disk; what a command inside a container prints. It also acts: restart, stop, start, rm, compose up and down, prune, exec.

## What it needs

- The `docker` CLI on PATH and a reachable daemon (the user's own permissions).
- ask-kit with kit support (`min_ask_kit = "0.2.0"`).
- No settings, no tokens.

## What it reads and runs

It runs `docker` (no shell, each argument separate) as the user: `ps`, `inspect --format`, `logs`, `system df -v`, `compose ls`, `volume ls`, `exec`, plus whatever action was asked. Nothing is read from files.

Refused because answers go to a cloud model: `inspect` without a `--format` or with one that prints `.Config`/`Env`, `compose config`, `exec` of `env`/`printenv`/`set` or reading `/proc/*/environ`. Refused or fixed because they never end: `logs -f`, `events` without `--until`, `attach`, `compose watch`; `stats` gets `--no-stream`, `compose up` gets `-d`, `logs` gets `--tail 200`.

## Brief to rebuild it from an empty folder

Make a folder with `ask-kit.toml` (id `temet.docker`, name `docker`, `says`, `keywords`, `route_hint`, `cite`, `acts`, one `[[sources]]` of kind `module`, name `docker`, module `docker.mjs`, api `api.d.ts`) and `instructions = "instructions.md"`.

`docker.mjs` exports `make({settings, push})` returning a `docker` global: `run(...args)` (execFile, no shell, never throws on non-zero exit, throws only on a refusal from `check(args)`), `json(...)` (JSON or JSON lines to an array), `ps()` (rows with state, health, ports, compose project and service from the labels), `inspect(name)` (a fixed `--format` of state, restart count and policy, memory limit, labels, mounts, ports, networks; never the environment), `logs(name, {tail, since, until})`, `df()` (`system df` and `system df -v` as JSON), `exec(container, ...cmd)`. `check` applies the refusals above.

Scripts in `scripts/` (each `export const meta = {purpose, params, returns, example}` and `export default async function ({docker}, params)`): `containers` (state, health, restarts, ports, project, stopped ones' exit code), `why-failing` (one container: state, exit code and its meaning, OOMKilled, restart count, health output, error lines and tail of logs, a one-line verdict), `ports` (published ports and holders, or the holder of one port), `compose` (projects, files, services), `disk` (summary, biggest images and volumes, unused counts, build cache).

`instructions.md` has the same structure as the github kit: how to work (scripts first, evidence = state, exit code, log line with timestamp, never read the environment, never follow logs, act on exactly what was named and read back), and the answer format (answer first, cite container names, ports, projects or log lines).

`bench/questions.json` holds questions of the kinds agents answer by hand with docker, with `expect` patterns that check the shape of an answer; add questions that name your own containers and run `ask-kit kit test docker`.

## Results

The bench has not been run on a model since it was made generic.
