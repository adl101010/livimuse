# LiviMuse

A fork of [Muse](https://github.com/museofficial/muse) with custom replies and commands.

## Where our changes live

| What | Where |
| --- | --- |
| Bot reply wording | `src/custom/messages.ts` |
| Our own slash commands | `src/custom/commands/` (copy `example.ts`, list it in `index.ts`) |
| Daily upstream merge | `.github/workflows/livimuse-sync.yml` |
| Image build → `ghcr.io/adl101010/livimuse` | `.github/workflows/livimuse-build.yml` |
| Dockge stack | `docker-compose.yml` |

Upstream files are only touched by one-line `messages.*` swaps and a small block in `src/inversify.config.ts`, which keeps merge conflicts rare.

## When the sync fails

A failed "LiviMuse sync upstream" run means a merge conflict. Nothing was pushed and the running bot is fine. To fix it locally:

```bash
git fetch upstream --tags
git merge vX.Y.Z
```

Resolve the files it lists (usually keep both sides), commit, and push. The build runs automatically.
