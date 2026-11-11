# Demo prompts by persona

Short prompts to paste into **Sage** (Workflows page, or the Sage panel in the editor). Every prompt does the same two things:

1. The **PayPal payment link** is sent as a **Slack DM**: in prompt 1 to the person tagged (Krish), in prompts 2–16 to **nehaprasad27118@gmail.com**.
2. Once it's **paid**, a notification is posted in the **Slack channel you choose**.

Before you run them:

- **Connect Slack** in Connections (**Add to Slack**) and pick the channel for the "paid" message. The same connection sends the DMs.
- **A Slack DM goes to a member ID, not an email.** For prompts 2–16, put Neha's member ID (the Slack user for nehaprasad27118@gmail.com: her profile → ⋯ → **Copy member ID**, like `U0123ABCD`) in the **Slack DM** block's *Send to*.
- **Replace `#your-channel`** in a prompt with the channel you want.
- **Pay with a PayPal sandbox personal account.** Everything runs in the PayPal Sandbox.

| Persona | Prompts |
| --- | --- |
| A teammate asks in Slack | 1 |
| Agency or studio owner | 2–4 |
| Creator or course seller | 5–6 |
| Online store owner | 7–8 |
| Subscription business | 9–10 |
| Community or open-source maintainer | 11–13 |
| Finance or ops lead | 14–16 |

---

## 1. A teammate asks in Slack

**1. "@Krish buy me flowers"**

```
When someone tags Krish in Slack with "buy me flowers", find a real bouquet under $60 and let AI pick one.
After I approve, create a PayPal payment link and send it to Krish as a Slack DM.
When Krish pays, post in #your-channel that Krish bought flowers for the person who asked.
```

This one starts from Slack itself, so in the Slack app: set the Event Subscriptions Request URL shown on the **Slack mention** block, subscribe to `message.channels`, and `/invite @Money Lego` to the channel. Then Neha writes *"@Krish buy me flowers"*, Krish gets the payment link by DM, and once he pays the channel reads *"@Krish bought flowers for @Neha"*. The same flow is ready-made as the **Slack: Buy Me Flowers** template.

---

## 2. Agency or studio owner

**2. Equipment for a client**

```
When I run it with a request, budget and client name, find a real product under that budget and create a PayPal payment link for it.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

**3. Software licence for a project**

```
When I run it with the software we need and a budget, find it under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

**4. Studio supplies**

```
When I run it with a list item and a budget, find the best match under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

## 3. Creator or course seller

**5. Recording gear**

```
When I run it with the gear I need and a budget, find a real product under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

**6. A gift for a collaborator**

```
When I run it with a gift idea and a budget, find a product under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

## 4. Online store owner

**7. Restock a best-seller**

```
When I run it with a product and a budget, find it under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

**8. Packaging supplies**

```
When I run it with the packaging I need and a budget, find a match under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

## 5. Subscription business

**9. A welcome kit for a new subscriber**

```
When I run it with a welcome-kit item and a budget, find a product under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

**10. Office equipment for the support team**

```
When I run it with the equipment and a budget, find a real product under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

## 6. Community or open-source maintainer

**11. Swag for contributors**

```
When I run it with a swag item and a budget, find a product under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

**12. A test device for the project**

```
When I run it with the device we need and a budget, find it under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

**13. A prize for a hackathon winner**

```
When I run it with a prize idea and a budget, find a product under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

## 7. Finance or ops lead

**14. A laptop for a new hire**

```
When I run it with the laptop spec and a budget, find a real product under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

**15. Office chairs**

```
When I run it with the chair we want and a budget, find a match under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

**16. Meeting-room equipment**

```
When I run it with the equipment and a budget, find a product under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

---

**Quick test input**, as the manual trigger's test payload:

```json
{ "request": "A quiet mechanical keyboard for a small design studio", "maxPrice": "150" }
```
