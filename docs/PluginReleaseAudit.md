# QueryHost plugin release audit

Observed October 15, 2026. These are release snapshots, not ongoing availability
guarantees. No package was uploaded, submitted, or published during this audit.
Later the same day, 0.1.0 was published and 0.2.0 submitted for review; see
[Publication on October 15](#publication-on-october-15) and the open
[published install loop](#open-published-install-loop).

## Approved package and development connection

The developer portal shows package `queryhost` version **0.1.0**, **Approved** and
**Ready to publish**, with publication **Not published**. Its metadata has the
QueryHost branding, Developer Tools category, website, support, privacy, and terms
links, with no metadata or skills findings. Its description is accurate but vague
about supported games and comparisons.

The installed connection shown in the supplied screenshot is a different app:
it reports **dev mode** and **DEVELOPMENT**. Its details page has the description
“QuestHost,” a generic icon, “No description” for the app, category “Other,” and
website “Unavailable.” Those placeholders do not describe the approved package.
The connected tools also identify their plugin as “QuestHost.”

The approved package's MCP panel shows only the original three tools, all **Not
live**, last checked 14 days ago. It reports **Endpoint unavailable** and no scan
findings. This dashboard label does not establish an endpoint outage: direct
HTTPS MCP requests succeeded during the audit. Inspect the connection and scan
state before publication; do not replace the endpoint based on that label alone.

## Live contract and behavior

- `https://query.host/mcp` initializes and advertises five tools: the three query
  tools plus app-only `open_queryhost` and `open_server_query` entrypoints.
- The live query input schema and catalog contain 43 profiles. The connected
  client query and comparison schemas contain 35. The missing profiles are
  `arma-reforger`, `avorion`, `eco`, `humanitz`, `space-engineers`, `starbound`,
  `v-rising`, and `vein`. The connected catalog returns all 43, so discovery can
  suggest IDs the older client schema cannot submit.
- MCP resources list both `ui://queryhost/server-cards-v2.html` and
  `ui://queryhost/query-app-v1.html`. Resource advertisement does not prove that
  ChatGPT renders the UI or offers either app-only entrypoint.
- A connected Minecraft Java query for `mc.hypixel.net` returned player counts,
  version, plain MOTD, sources, and QueryHost-measured RTT. Projection reported
  favicon and HTML omissions.
- A loopback query returned `TARGET_BLOCKED`. Comparing the public example with
  loopback retained the successful result and the independent blocked-target error
  in input order.
- The previous `test-minecraft.nodecraft.gg` example returned `DNS_FAILED`.
  This establishes failure to resolve at audit time, not that its server is offline.
- The website, privacy policy, terms, support issue page, and existing demo URL
  returned HTTP 200. The demo URL served `video/mp4`; this does not verify its
  contents or demonstrate the newer workspace.

## Prepared local changes

The unsubmitted 0.2.0 manifest now names representative supported games, explains
two-to-four-server comparisons, qualifies optional details and host UI support,
and mentions short-lived caching. Starter prompts and review cases use the
working third-party Minecraft example. The short description is “Check and
compare game servers.” The package already includes the canonical QueryHost SVG
and the four listing links.

## Remaining release work

Item 1 was resolved later on October 15 by publishing 0.1.0 and submitting 0.2.0.

1. Decide whether to publish approved 0.1.0 first or prepare 0.2.0 for review.
   Approval and a working development connection do not make a directory release
   public. Keep the approved package intact while making that decision.
2. Inspect the approved app's MCP configuration, refresh or rescan as appropriate,
   and verify that the client-visible schemas include the live registry. Confirm
   availability of the app-only entrypoints separately from the three model tools.
3. Correct the development connection description and refresh its tools if keeping
   it for testing. Directory publication does not replace that connection.
4. Test cards and both workspace entrypoints in supported hosts. Record a current
   demo before submitting 0.2.0; the earlier release notes identify the existing
   recording as an inline-card demo.
5. Recheck the example host, package contents, icon, links, and review cases before
   an authorized upload, submission, or publication. Verify the public listing and
   install the published plugin after publication.

## Publication on October 15

Recorded October 15, 2026, America/New_York, after this audit.

- **0.1.0 published.** An MCP rescan completed with no findings before
  publication. The portal shows endpoint `https://query.host/mcp`, no
  authentication, a verified domain, and all five tools **Live**. The scanned
  query definition contains all 43 live profiles, including the eight missing
  from the development connection. Public listing:
  <https://chatgpt.com/plugins/plugin_asdk_app_6abe77b4d3a4819181619426d75d8fae>.
- **0.2.0 in review.** Uploaded to the existing plugin with no metadata or skills
  findings and submitted (`pluginrel_db38290eb40081919446b8ebec24125f`). The
  uploaded package still uses the existing inline-card demo URL; no workspace
  recording was made. Uploaded ZIP SHA-256:
  `CFAE6F29C991E3A743CE4BB2C389C762360C8664C71563848917FAAC941E9CD3`.
- The development connection is separate and was kept. Remove it only after the
  published plugin installs successfully.

## Open: published install loop

Observed October 15, 2026, about 11:29 AM America/New_York, on 0.1.0.

1. Open the public listing while signed into ChatGPT and select Install plugin.
2. The dialog says “Could not load this app's connection details” and offers
   Open in browser.
3. Open in browser returns to the same listing, so installation loops.

The listing's app row shows the raw app ID and “No description.” The Install
action's own requests, captured without replay or modification, returned:

- `GET /backend-api/aip/connectors/asdk_app_6abe77b4d3a4819181619426d75d8fae?include_actions=false`:
  HTTP 404, `{"detail":"Connector not found"}`.
- `GET /backend-api/aip/connectors/asdk_app_6abe77b4d3a4819181619426d75d8fae/tos`:
  HTTP 404, `{"detail":"Connector not found"}`.
- `/backend-api/aip/connectors/asdk_app_6abe77b4d3a4819181619426d75d8fae/link`:
  HTTP 200, `{"link":null}`.

The failure is in ChatGPT's connector lookup before a connection dialog loads,
which points to publication propagation or connector registration on OpenAI's
side. It does not establish a QueryHost endpoint failure or a conflict with the
development connection, and no change in this repository is expected to fix it.

A support request was drafted but, as of this record, not sent:

> QueryHost version 0.1.0 is published and its MCP tools are Live with no scan
> findings, but the public plugin cannot be installed. Install shows “Could not
> load this app's connection details” and Open in browser loops to the listing.
> ChatGPT's connector details and tos requests both return 404 “Connector not
> found” for app asdk_app_6abe77b4d3a4819181619426d75d8fae; the link lookup
> returns null. Please check the published plugin's associated connector
> registration and availability.

Close this item once the published plugin installs.

OpenAI documents separate [package updates and MCP scans](https://developers.openai.com/plugins/deploy/submission)
and [retention of approved tool definitions during continuous review](https://developers.openai.com/plugins/deploy/app-review).
