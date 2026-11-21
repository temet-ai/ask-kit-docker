# ask-kit-docker

An [ask-kit](https://github.com/temet-ai/ask-kit) kit that lets your coding agent's `ask` tool
answer questions about the Docker containers on your machine. A cheap model runs `docker ps`,
`docker logs`, `docker inspect` and `docker exec` outside your agent's context and answers with
container names, ports and log lines.

Kinds of question it is built for, which agents otherwise answer by hand with `docker`:

- Which container publishes host port 5432, and is it healthy?
- Any ERROR or FATAL lines in the my-db container's logs over the last 3 days? Quote them.
- How much disk is docker using, which part is biggest, and how much can be reclaimed?

## Install

You need [ask-kit](https://github.com/temet-ai/ask-kit#set-it-up), the `docker` CLI and access to a
Docker daemon.

Paste this into your agent:

```
Read ~/.config/ask-kit/AGENTS.md, then add this kit: github.com/temet-ai/ask-kit-docker
```

Or run it yourself:

```sh
ask-kit kit install temet-ai/ask-kit-docker        # shows what it reads, changes and runs
ask-kit kit install temet-ai/ask-kit-docker --yes  # installs and enables it
```

Restart your agents so `ask` lists `docker`. `ask-kit kit list` says whether it can run on this
machine, and why not. The kit has no settings.

## What it can change

When asked, it restarts, stops, starts and removes containers, runs `compose up` and `down`,
`system prune`, and commands inside a container (`docker exec`, for example `psql`).

`docker.mjs` checks each command before it runs:

- Commands that print secrets are refused: `inspect` without a safe `--format`, `compose config`,
  and `exec ... env` or `printenv`. What the investigator reads goes to a model.
- Commands that never end are refused: `logs -f`, `compose watch`, and `events` without `--until`.
- Some are made to finish: `stats` gets `--no-stream` and `compose up` gets `-d` when they lack it,
  and `logs` gets `--tail 200` when it has no `--tail`, `-n`, `--since` or `--until`.

## How well it works

The bench, `bench/questions.json`, holds questions of those kinds with patterns that check the
shape of an answer, so they run on any machine with Docker. It has not been run against a model.
Add questions that name your own containers.

## What is in it

`docker.mjs` gives the investigator the `docker` CLI with the refusals above. Its scripts are
`containers` (state, health, restarts and ports, with the troubled ones flagged), `why-failing`
(exit code, OOM kill, health check and error lines for one container), `compose` (what each
compose project holds), `ports` (which container holds a host port) and `disk` (images, volumes
and build cache, and what is reclaimable). [RECIPE.md](RECIPE.md) says what it reads and runs, and
how to rebuild it.

MIT licence.
