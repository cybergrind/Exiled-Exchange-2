# Market fixtures

Recorded responses, trimmed to what the tests need. Never hand-edit values.

| File | Source | Captured | Trimmed to |
| --- | --- | --- | --- |
| `cx-hours/<unix hour>.json` | `GET https://web.poecdn.com/api/currency-exchange/poe2/<unix hour>` | 2026-11-02, hours 01:00–06:00 UTC | Forbidden Rites markets between Arcanist's Etcher, Gemcutter's Prism, Omen of Bartering, Orb of Alchemy, Armourer's Scrap, Exalted, Divine and Chaos Orb; plus Runes of Aldur markets involving the Etcher (league-filter tests) |
| `cx-end-of-stream.json` | same endpoint, current hour (HTTP 404) | 2026-11-02 07:xx UTC | as received: documented end of stream |
| `cx-ids-forbidden-rites.json` | every `market_pair` id seen in Forbidden Rites over the six hours above | 2026-11-02 | sorted id list, 648 ids |
| `relay-overview-forbidden-rites.json` | `GET https://api.exiledexchange2.dev/proxy/Forbidden%20Rites/overviewData.json` | 2026-11-02 06:30 UTC data | `core`; Currency lines for the items above; all Ritual lines; all UniqueFlasks and UniqueSanctumRelics lines; Temporalis and Svalinn armour lines |
| `relay-namespace-map.json` | `GET https://api.exiledexchange2.dev/proxy/data/namespaceMap.json` | 2026-11-02 | as received |
| `stash-unique-armours.json` | `GET https://poe.ninja/poe2/api/economy/stash/current/item/overview?league=Forbidden+Rites&type=UniqueArmours` | 2026-11-02 | Temporalis and Svalinn lines |
| `exchange-empty-type.json` | `GET https://poe.ninja/poe2/api/economy/exchange/current/overview?league=Forbidden+Rites&type=Omens` | 2026-11-02 | as received: a wrong type returns 200 with no lines |

Golden values over the six hours (see `guide/poe-source.html`, WP-11): Etcher on the exalted pair
4.908 ex typical, 3.0–14 range, 2,456 traded; chaos 0.1561, 0.05–0.25; divine 0.0189, 0.012–0.0233.
Gemcutter's Prism 17.11 ex.
