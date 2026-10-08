# Sales close audit — storefront

Scope: customer-facing close from cart to payment. The storefront does not
decide prices, stock, payment state or delivery truth; it only reduces friction
between canonical facts and the customer's next action.

## Keep

- review before order creation;
- real delivery quote and preferred-window wording;
- server-confirmed reservation/hold facts;
- no claim of payment until R Supply OS says it is paid;
- direct link to the customer's own order;
- WhatsApp as a continuity/support path.

## Changed

### Internal language → customer action

The primary checkout action is **Apartar pedido**, not «Registrar pedido».

Reason: the actual customer benefit is that inventory is held. «Registrar» is an
internal implementation verb and weakens the close by asking the customer to
understand the system instead of taking the action.

The success state is **Pedido apartado**, and copy states that no charge occurs
until the customer completes a payment.

### Payment link → primary next action

When Commerce Closure returns a valid HTTPS Mercado Pago payment link:

1. render a primary CTA with the actual outstanding balance:
   **Pagar $X con Mercado Pago**;
2. keep **Confirmar por WhatsApp** available as the secondary path;
3. keep **Ver mi pedido** and **Seguir comprando** below both.

When no payment link exists, WhatsApp remains the main continuation.

The browser never fabricates a link or amount. It reads
`commerce.payment_link` and `commerce.balance_due/total_due` from the server.

## Guardrails

Do not add:

- fake countdowns;
- fake low-stock labels;
- fabricated reviews or popularity;
- pre-checked upsells;
- payment claims inferred by JavaScript;
- copied totals in WhatsApp as a second financial authority.

The close should be explicit, not deceptive.
