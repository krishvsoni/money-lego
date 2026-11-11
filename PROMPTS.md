# Demo prompts by persona

Short prompts to paste into **Sage** (Workflows page, or the Sage panel in the editor). Every prompt does the same two things:

1. The **PayPal payment link** is sent to **nehaprasad27118@gmail.com** as a **Slack DM**.
2. Once it's **paid**, a notification is posted in the **Slack channel you choose**.

Before you run them:

- **Connect two Slack destinations** in Connections: one that posts to Neha's DM (nehaprasad27118@gmail.com), and one for your channel. After Sage builds the workflow, pick Neha's DM in the first Slack block and your channel in the second.
- **Replace `#your-channel`** in a prompt with the channel you want.
- **Pay with a PayPal sandbox personal account.** Everything runs in the PayPal Sandbox.

| Persona | Prompts |
| --- | --- |
| Agency or studio owner | 1–3 |
| Creator or course seller | 4–5 |
| Online store owner | 6–7 |
| Subscription business | 8–9 |
| Community or open-source maintainer | 10–12 |
| Finance or ops lead | 13–15 |

---

## 1. Agency or studio owner

**1. Equipment for a client**

```
When I run it with a request, budget and client name, find a real product under that budget and create a PayPal payment link for it.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

**2. Software licence for a project**

```
When I run it with the software we need and a budget, find it under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

**3. Studio supplies**

```
When I run it with a list item and a budget, find the best match under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

## 2. Creator or course seller

**4. Recording gear**

```
When I run it with the gear I need and a budget, find a real product under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

**5. A gift for a collaborator**

```
When I run it with a gift idea and a budget, find a product under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

## 3. Online store owner

**6. Restock a best-seller**

```
When I run it with a product and a budget, find it under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

**7. Packaging supplies**

```
When I run it with the packaging I need and a budget, find a match under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

## 4. Subscription business

**8. A welcome kit for a new subscriber**

```
When I run it with a welcome-kit item and a budget, find a product under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

**9. Office equipment for the support team**

```
When I run it with the equipment and a budget, find a real product under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

## 5. Community or open-source maintainer

**10. Swag for contributors**

```
When I run it with a swag item and a budget, find a product under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

**11. A test device for the project**

```
When I run it with the device we need and a budget, find it under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

**12. A prize for a hackathon winner**

```
When I run it with a prize idea and a budget, find a product under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

## 6. Finance or ops lead

**13. A laptop for a new hire**

```
When I run it with the laptop spec and a budget, find a real product under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

**14. Office chairs**

```
When I run it with the chair we want and a budget, find a match under that budget and create a PayPal payment link.
Send the payment link to nehaprasad27118@gmail.com as a Slack DM.
When it's paid, post in #your-channel.
```

**15. Meeting-room equipment**

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
