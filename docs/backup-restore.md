# Backup and restore

A backup is a PostgreSQL dump of the whole database: every user's cards, subscriptions, transactions, statements and the sign-in records. **Treat a backup like the live database.** The scripts write backups readable by you only, `backups/` is git-ignored, and copies that leave the machine should be encrypted.

The backup and restore scripts and the drill below are tested by the project (`npm run backup:drill`). The scheduling and encryption snippets are standard examples that are not run by any test here.

## Back up

With the stack running, from the repository root:

```sh
sh scripts/backup.sh        # or: npm run backup
```

This runs `pg_dump` inside the `db` container (no PostgreSQL client needed on the host) and works while the app is running. It writes `backups/card-ledger-<UTC timestamp>-<NN>.dump`, reads the whole archive back to catch a truncated or unreadable dump, and keeps the newest 14 files. That read-back is not a checksum: it cannot prove a silent bit flip did not happen, so verify off-host copies with a checksum of your own (for example `shasum -a 256`) and keep the restore drill in your routine.

| Variable | Default | Meaning |
|---|---|---|
| `BACKUP_DIR` | `backups` (relative to the repository root) | where dumps are written |
| `BACKUP_KEEP` | `14` | how many of the newest dumps to keep; older ones are deleted |

The script exits non-zero and leaves no file behind when anything fails, so a scheduler or monitor can alert on it.

**What is not in the backup:** your `.env`. Keep a copy of it somewhere safe and separate (it holds `BETTER_AUTH_SECRET` and the database password). The dump alone restores your data; session cookies are tied to `BETTER_AUTH_SECRET`, so with a different value everyone simply signs in again.

### Schedule it

Cron (daily at 03:00; adjust the path):

```cron
0 3 * * * cd /opt/card-ledger && sh scripts/backup.sh >> backups/backup.log 2>&1
```

Or a systemd timer:

```ini
# /etc/systemd/system/card-ledger-backup.service
[Unit]
Description=Card Ledger database backup

[Service]
Type=oneshot
WorkingDirectory=/opt/card-ledger
ExecStart=/bin/sh scripts/backup.sh
```

```ini
# /etc/systemd/system/card-ledger-backup.timer
[Unit]
Description=Daily Card Ledger backup

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable with `systemctl enable --now card-ledger-backup.timer`. The user running it must be able to run `docker compose`.

### Keep a copy off the machine

A backup on the same disk does not survive losing the disk. Copy dumps to another machine or storage, **encrypted first**, because they contain all your financial data. For example with [age](https://age-encryption.org):

```sh
age -r <your-public-key> -o backups/card-ledger-2026-10-10.dump.age backups/card-ledger-2026-10-10-01.dump
# copy the .age file anywhere; keep the private key somewhere else
age -d -i key.txt card-ledger-2026-10-10.dump.age > card-ledger.dump     # to use it
```

`gpg --symmetric` works too. Local retention only applies to files in `BACKUP_DIR` that match `card-ledger-*.dump`.

## Restore

`scripts/restore.sh` never guesses: without `--force` it only restores into an **empty** database, and with `--force` it first writes a safety backup of the current data. The restore is one transaction, so a failure never leaves a half-restored database.

### Onto a new server, or an empty database

1. Install as in the [self-hosting guide](./self-hosting.md): clone, create `.env` with the **same** `BETTER_AUTH_SECRET` as before, but do not start the whole stack yet.
2. Copy your dump to the machine and run:

   ```sh
   docker compose up -d --wait db
   sh scripts/restore.sh /path/to/card-ledger-....dump
   ```

   The script restores, then starts the stack; the one-shot `migrate` service applies any migrations newer than the backup.
3. Check it: `curl -fsS http://127.0.0.1:3000/api/health`, sign in, look at a recent transaction.

### Replace the current data

```sh
sh scripts/restore.sh backups/card-ledger-....dump --force
```

This stops the app and reminder job, saves what is there as a new backup (and aborts, starting them again, if it cannot), recreates the database, restores, and starts everything again. If the script is ever interrupted after the database was dropped it says so and prints the exact command that brings your previous data back; a database that is missing altogether is treated as empty, so running the restore again recovers it. The safety backup is never pruned by the restore itself.

## Restore drill

A backup you have never restored is a hope, not a backup.

**Automated, synthetic data.** `npm run backup:drill` builds a throwaway stack, loads the demo data, backs it up, destroys the database volume, restores onto the empty database, and checks that every table has the same number of rows, the app is healthy and the demo user can sign in with the original password. It also checks retention, private file permissions, that a failed backup leaves nothing behind, and that restore refuses a non-empty database without `--force`. It never touches your running instance. Run it after changing anything under `scripts/` or upgrading Docker, and as the first thing to check if a restore ever surprises you.

**Your real backup.** To prove your own latest backup restores into a working copy, without touching the running instance:

```sh
sh scripts/restore-test.sh backups/<your newest dump>
```

It starts a separate throwaway compose project (a unique name, its own database volume and port 3199), restores the backup into it, waits for `/api/health`, prints the row count of every table, and removes everything again. Add `--keep` to leave the copy running so you can sign in at `http://localhost:3199` and look around; the command to remove it is printed.

Two things make this safe where hand-typed commands were not:

- every compose command names its project with `-p`, so nothing can resolve to your live stack, even from a new terminal or under `sudo`;
- reminder emails are switched off in the copy and the script checks that, because a restored copy of real data would otherwise email your real users.

Do not try a restored copy by exporting `COMPOSE_PROJECT_NAME` and running `docker compose up` yourself: the stack reads your live `.env`, SMTP settings included.

Do this when you set up backups, then every few months.

## Troubleshooting

| Message | Meaning |
|---|---|
| `backup: pg_dump failed (is the stack running?)` | The `db` container is not running. `docker compose up -d`, then retry. |
| `backup: BACKUP_KEEP must be a positive integer` | Fix the value; `0` is not allowed because it would delete every backup. |
| `restore: the database already contains N tables` | You are restoring over live data. Use `--force` only if that is what you want. |
| `restore: '...' is not a readable backup` | Not a dump made by `scripts/backup.sh`, or it was truncated or corrupted in transit. Use another copy. |
| `restore: the safety backup failed, so nothing was changed` | The current database could not be backed up first (disk full, container down). Fix that, then retry. |
