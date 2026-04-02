# Niche Selection Playbook

> **Reference for choosing city + niche combinations for Simon Cowell runs.**

## Selection Criteria

A good niche for FlyNerd has these characteristics:

1. **Service-area businesses** — they go to the customer (HVAC, plumbing, cleaning), not the other way around. These businesses often lack websites because their owners are tradespeople, not marketers.
2. **High customer lifetime value** — a single HVAC install or plumbing repair is $500-$5,000+. The business can afford a website.
3. **Review-dependent** — customers check Google reviews before calling. High review counts mean strong social proof for the demo site.
4. **Low digital sophistication** — the owner runs the business from a truck, not an office. Facebook page is their "website."
5. **Local search volume** — people search "{niche} near me" or "{niche} in {city}" frequently.

## Google Places Type Mapping

When running Simon Cowell, the `includedType` parameter maps niches to Google Places types:

| Niche Input | Google Places `includedType` |
|-------------|------------------------------|
| hvac | `hvac_contractor` |
| plumber / plumbing | `plumber` |
| electrician / electrical | `electrician` |
| roofing | `roofing_contractor` |
| landscaping | `landscaper` |
| pest control | `pest_control_service` |
| cleaning | `house_cleaning_service` |
| painting | `painter` |
| locksmith | `locksmith` |
| barbershop | `barber_shop` |
| auto repair | `auto_repair` |
| moving | `moving_company` |
| garage door | — (use text query only) |
| handyman | — (use text query only) |
| tree service | — (use text query only) |

For niches without a direct type match, omit `includedType` and rely on text query matching.

## Active Markets

| Priority | City | Niche | Status | Notes |
|----------|------|-------|--------|-------|
| 1 | Atlanta, GA | HVAC | PENDING | Home turf, highest urgency |
| 2 | Nashville, TN | Plumbing | PENDING | Growing market, less competition |

## Expansion Criteria

Add a new market when:
- Current market has 5+ leads in OUTREACHED or later status
- At least 1 lead has converted to NEGOTIATING
- Pipeline capacity allows (Tyrion can process ~20 leads per run)