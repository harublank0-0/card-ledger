# Data export format

Card Ledger lets you download everything you have recorded. This page describes the files so you can read them with any tool or import them elsewhere.

Downloads are on **Settings → Your data**, or directly (while signed in):

| File | URL |
|---|---|
| Everything, one JSON document | `/api/export/json` |
| Transactions | `/api/export/csv/transactions` |
| Statements | `/api/export/csv/statements` |
| Statement payments | `/api/export/csv/statement-payments` |
| Subscriptions | `/api/export/csv/subscriptions` |
| Cards | `/api/export/csv/cards` |
| Categories | `/api/export/csv/categories` |

Every request needs your session; without one the answer is `401` and no data. Responses are sent with `Cache-Control: no-store`. Files contain **only your own records**.

## What is and is not included

Included: your name and email, your reminder settings, categories, cards (last four digits only), subscriptions, transactions (including refunds), statements and statement payments. Archived records are included and flagged `archived: true`.

Never included: your password or its hash, sessions, sign-in tokens, and the reminder delivery log (it is operational data, not financial data).

## Conventions

- **Money** is an integer count of minor units (`amountMinor`, e.g. paisa or cents) with its ISO 4217 `currency`. A decimal string (`amount`, e.g. `"649.00"`) is added for convenience. Amounts are always positive; a transaction's `type` (`EXPENSE` or `REFUND`) gives the direction. Amounts in different currencies are never combined.
- **Dates** with no time of day (`occurredOn`, `dueDate`, `periodStart`, `anchorDate`, …) are calendar dates, `YYYY-MM-DD`.
- **Timestamps** (`createdAt`, `exportedAt`) are UTC ISO 8601.
- **References** use ids (`cardId`, `categoryId`, `statementId`, `refundOfId`, `subscriptionId`) and, where handy, the readable name next to them (`cardName`, …).
- `null` means "not set".

## JSON document

```jsonc
{
  "format": "card-ledger-export",
  "version": 1,
  "exportedAt": "2026-10-10T08:00:00.000Z",
  "account": { "name": "…", "email": "…" },
  "settings": { "timezone": "Asia/Kathmandu", "emailEnabled": true, "offsetsDays": [7, 3, 1],
                "renewalEnabled": true, "expiryEnabled": true,
                "cancellationEnabled": true, "paymentDueEnabled": true },   // or null
  "categories": [ { "id", "name", "archived", "createdAt" } ],
  "cards": [ { "id", "name", "issuer", "last4", "currency", "creditLimitMinor", "creditLimit",
               "statementDay", "paymentDueDay", "archived", "createdAt" } ],
  "subscriptions": [ { "id", "name", "amountMinor", "currency", "amount", "intervalCount",
                       "intervalUnit", "anchorDate", "status", "autoRenew", "expiresOn",
                       "cancellationDeadline", "cancelledOn", "cardId", "cardName", "notes",
                       "archived", "createdAt" } ],
  "transactions": [ { "id", "type", "occurredOn", "description", "amountMinor", "currency",
                      "amount", "categoryId", "categoryName", "cardId", "cardName",
                      "subscriptionId", "subscriptionName", "refundOfId", "notes", "createdAt" } ],
  "statements": [ { "id", "cardId", "cardName", "periodStart", "periodEnd", "dueDate", "currency",
                    "balanceMinor", "balance", "minimumDueMinor", "minimumDue",
                    "paidMinor", "outstandingMinor", "createdAt" } ],
  "statementPayments": [ { "id", "statementId", "paidOn", "amountMinor", "currency", "amount",
                           "notes", "createdAt" } ]
}
```

Notes:

- `intervalUnit` is `WEEK`, `MONTH` or `YEAR`; "quarterly" is `intervalCount: 3` with `MONTH`.
- `status` of a subscription is `ACTIVE` or `CANCELLED`.
- A refund has `type: "REFUND"` and `refundOfId` pointing at the expense it reverses, in the same currency.
- `paidMinor` and `outstandingMinor` on a statement are **derived** from `statementPayments` (`outstanding = max(0, balance − paid)`); the payments are the source of truth. Paying more than the balance is allowed and shows as a credit; it does not change `outstandingMinor` below zero.
- Statement payments are **not** transactions and are never part of spending totals.

### Checking totals

From the file alone you can reproduce what the app shows: spending per currency is the sum of `EXPENSE` amounts minus the sum of `REFUND` amounts, grouped by `currency`; a statement's outstanding amount is its `balanceMinor` minus the payments with its `statementId` (not below zero).

## CSV files

One file per table, UTF-8 with a byte order mark (so Excel opens non-English text correctly), comma separated, quoted per RFC 4180, CRLF line endings, with a header row. Column names are the same as the JSON fields above, in this order:

| File | Columns |
|---|---|
| categories | `id, name, archived, createdAt` |
| cards | `id, name, issuer, last4, currency, creditLimitMinor, creditLimit, statementDay, paymentDueDay, archived, createdAt` |
| subscriptions | `id, name, amountMinor, currency, amount, intervalCount, intervalUnit, anchorDate, status, autoRenew, expiresOn, cancellationDeadline, cancelledOn, cardId, cardName, notes, archived, createdAt` |
| transactions | `id, type, occurredOn, description, amountMinor, currency, amount, categoryId, categoryName, cardId, cardName, subscriptionId, subscriptionName, refundOfId, notes, createdAt` |
| statements | `id, cardId, cardName, periodStart, periodEnd, dueDate, currency, balanceMinor, balance, minimumDueMinor, minimumDue, paidMinor, outstandingMinor, createdAt` |
| statement-payments | `id, statementId, paidOn, amountMinor, currency, amount, notes, createdAt` |

### Spreadsheet safety

Spreadsheet programs run text that starts with `=`, `+`, `-`, `@`, a tab or a carriage return as a formula. To protect you when you open a file, any **text** cell starting with one of those characters is written with a leading apostrophe (`'`). Numbers and booleans are written as they are. If you re-import a CSV elsewhere, strip a leading `'` from text fields.

## Versioning

`format` and `version` identify the file. Adding fields keeps `version` the same, so readers must ignore fields they do not know. Renaming or removing a field, or changing its meaning, increases `version`, and this page will describe each version.

## Limits

An export is built in memory, which is fine for personal use (tens of thousands of records). Importing a file back into Card Ledger is not available yet.

## Deleting your account

Settings → Delete account removes your account and every record above, permanently. It asks for your password and for you to type `DELETE`, and shows how many records will go. Download your data first. Because sign-up on a self-hosted instance is normally limited to the first account (`SIGNUP_MODE=first-user`), deleting the **only** account on an instance re-opens registration until someone creates a new one.
