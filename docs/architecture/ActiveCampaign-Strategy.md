---
title: ActiveCampaign Strategy & Workflow (FlyNerd Workspace)
aliases: [AC Strategy, FlyNerd CRM, Workspace Email Workflow]
tags: [crm, automation, architecture, activecampaign]
date_created: {{date}}
---

# ActiveCampaign Flow & Workspace Strategy

This document outlines the architecture and workflow for integrating ActiveCampaign (AC) across the FlyNerd unified workspace, which contains multiple interconnected sub-projects (`flynerd-agency`, `flynerdtech`, `sonata-stack`, `raidsecuritycorp`, etc.).

## 1. Environment & Subfolder Management

The workspace is organized into independent subfolders, representing distinct aspects or brands of the business. 
- **Decoupled Configuration:** Each subfolder maintains its own `.env` file containing `ACTIVECAMPAIGN_URL` and `ACTIVECAMPAIGN_KEY`. 
- **Flexibility:** This allows specific services (like `raidsecuritycorp`) to operate on distinct ActiveCampaign accounts or sandbox environments if needed, without breaking core agency workflows in `flynerdtech`. When running scripts or starting dev servers, the localized `.env` file determines the CRM destination.

## 2. Infrastructure as Code (Programmatic Setup)

Instead of relying on manual configuration inside the ActiveCampaign GUI, the workspace treats CRM infrastructure as code:
- **`create-ac-pipeline.mjs`:** Programmatically generates Deal Pipelines and Stages to ensure standardization across developer machines and production.
- **`create-deal-fields.mjs`:** Initializes custom contact and deal fields ensuring the API endpoints in `lib/activecampaign.ts` never encounter missing field errors.

## 3. The "Hov" Agent & Cold Outreach Workflow (Sonata Stack)

Because ActiveCampaign's standard API is optimized for marketing automation rather than 1:1 transactional cold emails, the AI agents (`Sonata Stack / Hov`) use a hybrid approach:
1. **Lead Enrichment:** AI agents discover, qualify, and personalize email copy for a lead using Anthropic.
2. **CRM Injection:** The `Hov` outreach agent creates the contact and deal via the standard AC API, pushes the personalized AI copy into a custom field, and syncs via `ac-sync-logic.ts`.
3. **Tag-Triggered Dispatch:** Rather than sending emails via API, the agent tags the lead (e.g., `FLYNERD_OUTREACH_PENDING`). 
4. **AC Automation:** This tag triggers an ActiveCampaign Automation that natively delivers the personalized cold email, preserving deliverability, IP reputation, and tracking metrics.

## 4. Automation Routing (n8n Integration)

For complex multi-stage workflows, the workspace leverages **n8n** tied directly into ActiveCampaign.
- Niche workflows (e.g., film industry vs. medical industry campaigns) trigger specific `n8n-nodes-base.activeCampaign` components.
- Incoming lead data from forms (e.g., in `flynerdtech` or `flynerd-agency`) are routed through `ac-sync-logic.ts` which handles data formatting, ensuring the prospect perfectly matches the AC Deal schema.

## Summary Checklist for New Deployments/Subfolders
- [ ] Ensure `.env` contains correct `ACTIVECAMPAIGN_URL` and `KEY`.
- [ ] Run `node create-ac-pipeline.mjs` to establish CRM stages.
- [ ] Run `node create-deal-fields.mjs` to map AI custom fields.
- [ ] Ensure the tag-based delivery Automation is active inside the AC Dashboard before triggering the AI agents.