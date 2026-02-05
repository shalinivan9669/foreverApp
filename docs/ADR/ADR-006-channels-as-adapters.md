**ADR-006: Channels As Adapters (Discord/TG/Web)**

**Как Сейчас (Обзор)**
1. Вход пользователя реализован через Discord SDK, а токен получается через `/api/exchange-code`. Доказательства: `src/app/page.tsx:18-43`, `src/app/api/exchange-code/route.ts:3-27`.

**Evidence**
| Факт | Тип | Источник (path:line) | Цитата (?2 строки) |
|---|---|---|---|
| Discord SDK authorize | ui | `src/app/page.tsx:18-27` | `const sdk      = new DiscordSDK(clientId);`<br>`const { code } = await sdk.commands.authorize({` |
| OAuth exchange-code | api | `src/app/api/exchange-code/route.ts:3-27` | `const { code, redirect_uri } = (await req.json()) as {` |

**Decision**
- Считать каналы (Discord/TG/Web) адаптерами к единому домену и контрактам.

**Consequences**
- Доменные сервисы не зависят от конкретного канала.
- Канальные адаптеры используют общие API/DTO.
