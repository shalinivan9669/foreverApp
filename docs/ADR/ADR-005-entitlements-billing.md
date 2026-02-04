**ADR-005: Billing Abstraction Via Entitlements**

**Как Сейчас (Обзор)**
1. В репозитории нет упоминаний billing/entitlement/stripe/subscription/premium/payment (по поиску). Доказательства: `docs/_evidence/search-no-billing.txt:1-3`.

**Evidence**
| Факт | Тип | Источник (path:line) | Цитата (?2 строки) |
|---|---|---|---|
| Поиск по billing/entitlement без совпадений | config | `docs/_evidence/search-no-billing.txt:1-3` | `result: NO_MATCHES` |

**Decision**
- Ввести абстракцию entitlements и BillingProvider, не привязываясь к конкретному провайдеру.

**Consequences**
- Доступы будут вычисляться по entitlements и кэшироваться в `featureFlags`/DTO.
- Подключение новых платёжных каналов не требует изменений доменной логики.
