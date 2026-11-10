# Demo prompts by persona

Short prompts to paste into **Sage** (Workflows page, or the Sage panel in the editor). They're grouped by the people Money Lego is built for, and each uses only triggers and blocks Money Lego has, so Sage can build every one.

Before you run them:

- **Slack is for messages out.** Workflows post to Slack and can tag people, but a Slack message can't start a workflow. To start a payment from chat, use the **Discord command** trigger (persona 6).
- **Tag people with member IDs.** Write `<@U0123ABCD>` (Slack profile → ⋯ → Copy member ID); a plain `@name` doesn't ping. After Sage builds the workflow, pick your Slack channel in each Slack block.
- **Use sandbox emails for payouts**, like `sb-…@personal.example.com`. A real address isn't paid in the sandbox.
- **Recipients are fixed in the workflow.** A payout pays the people listed in its split block; change them there or ask Sage.

| Persona | Pain today | Prompts |
| --- | --- | --- |
| Agency or studio owner | Splitting client payments, invoicing, sourcing for clients | 1–3 |
| Creator or course seller | Sharing sale revenue with collaborators | 4–5 |
| Online store owner | Paying suppliers and handling refunds | 6–7 |
| Subscription business | Failed payments and paid invoices | 8–9 |
| Community or open-source maintainer | Paying bounties fairly and quickly | 10–12 |
| Finance or ops lead | Approvals, reminders, weekly reporting | 13–15 |

---

## 1. Agency or studio owner

*Runs a small team, gets paid by clients, pays freelancers, sources products for clients.*

**1. Split a client payment with the team**

```
When a client pays my $500 PayPal checkout, split the net 60% to me, 25% to the designer and keep 15% as reserve.
Run an AI risk check and wait for my approval.
Send the PayPal payouts, follow their status, and post in Slack tagging <@U_DESIGNER> when paid.
```

**2. Invoice a client, then chase it**

```
When I run it with a client email, project name and amount, create a PayPal invoice due in 14 days.
Wait for my approval, then send it through PayPal and post in Slack tagging <@U_FINANCE>.
```

**3. Source a product for a client (Channel3)**

```
When I run it with a request, budget and client name, search Channel3 for real products under that budget and let AI pick the best one.
If it costs more than 100, post it in Slack tagging <@U_FINANCE>; otherwise tag <@U_OPS>. If nothing is found, tag <@U_SOURCING>.
Wait for my approval, create a PayPal checkout link for the pick and post it in Slack.
Wait up to 72 hours for the client to pay and log the result.
```

## 2. Creator or course seller

*Sells a course, template pack or session; shares revenue with a co-creator or editor.*

**4. Share every sale with a co-creator**

```
When a buyer pays my $49 PayPal checkout, split the net 70% to me and 30% to my co-creator.
Run an AI risk check and wait for my approval.
Send the payout to my co-creator, follow its status, and post in Slack tagging <@U_COCREATOR> when it's paid.
```

**5. Monday sales digest**

```
Every Monday at 9:00 Asia/Kolkata, read the last 7 days of PayPal transactions.
Have AI write a short digest of sales, refunds and anything unusual, and post it in Slack.
```

## 3. Online store owner

*Sells on Shopify or a checkout page; pays suppliers; handles refund requests.*

**6. Pay the supplier when an order is paid**

```
When my Shopify store reports an order paid, log the order name and total.
Pay the supplier a fixed $20 by PayPal payout after my approval.
Post in Slack tagging <@U_OPS> with the order name once the payout is sent.
```

**7. Refund desk**

```
When I run it with a capture id, amount and reason, have AI check the request.
Post it in Slack tagging <@U_FINANCE> and wait for my approval.
If I approve, refund it through PayPal once per capture and post the result in Slack.
```

## 4. Subscription business

*Bills monthly through PayPal; loses revenue to failed payments.*

**8. Recover a failed subscription payment**

```
When a PayPal subscription payment fails, load the subscription and have AI explain why it failed.
Post the reason in Slack tagging <@U_SUPPORT>.
Draft a catch-up invoice for the balance and send it through PayPal after I approve.
```

**9. Thank-you when an invoice is paid**

```
When a PayPal invoice is paid, post in Slack: "Invoice paid: {{ trigger.resourceId }}" tagging <@U_FINANCE>.
Have AI write a short thank-you note for the client and post the draft in Slack for review.
```

## 5. Community or open-source maintainer

*Runs a Discord or a GitHub project; pays contributors for bounties.*

**10. Pay a bounty when a pull request is merged**

```
When a pull request is merged in owner/repo on GitHub, post in Slack tagging <@U_MAINTAINER> that it needs a bounty.
Pay the contributor $25 (sb-…@personal.example.com) by PayPal payout after my approval, once per pull request.
Post in Slack when PayPal reports it paid.
```

**11. Pay a bounty from a Discord command**

```
When someone with the allowed role runs /pay-neha in my Discord server, pay $2.00 to Neha (sb-…@personal.example.com).
Pay each bounty_id only once, and post in Slack tagging <@U_FINANCE> that bounty {{ trigger.options.bounty_id }} needs approval.
Wait for my approval, send the PayPal payout and follow its status.
Post in Slack tagging <@U_NEHA> when PayPal reports it paid.
```

**12. Bounty request with a reject path**

```
When someone runs /request-payout in my Discord server, post "Bounty {{ trigger.options.bounty_id }} requested" in Slack tagging <@U_FINANCE>.
Split $25.00: 100% to the designer (sb-…@personal.example.com), then wait for my approval.
If I reject, post "Bounty {{ trigger.options.bounty_id }} rejected" in Slack.
If I approve, send the PayPal payout and post in Slack when it's paid.
```

The Discord command takes one text input, `bounty_id` (for example `/pay-neha bounty_id:launch-banner`). The amount and recipient are set in the workflow; the bounty id names the job and stops it being paid twice.

## 6. Finance or ops lead

*Keeps the money tidy: approvals, reminders, reporting.*

**13. Overdue invoice nudges**

```
Every Monday at 9:00, find my overdue PayPal invoices.
Have AI draft a friendly reminder for each and wait for my review.
Send the reminders through PayPal and post a summary in Slack tagging <@U_FINANCE>.
```

**14. Approved payout requests from a sheet**

```
Every Friday at 16:00, read the approved, unpaid rows from my "Payouts" Google Sheet.
If there are any, post how many rows are waiting in Slack tagging <@U_FINANCE>.
```

**15. Weekly ops digest**

```
Every Friday at 17:00, read the last 7 days of PayPal transactions.
Have AI write a digest of totals, refunds and anything unusual, and post it in Slack tagging <@U_FINANCE>.
```

---

**Quick test input** for the Channel3 prompt (3), as the manual trigger's test payload:

```json
{ "request": "A quiet mechanical keyboard for a small design studio", "maxPrice": "150", "client": "Studio North" }
```
