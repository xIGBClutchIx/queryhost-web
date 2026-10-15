# QueryHost plugin release audit

Observed October 15, 2026. These are release snapshots, not ongoing availability
guarantees. No package was uploaded, submitted, or published during this audit.

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

OpenAI documents separate [package updates and MCP scans](https://developers.openai.com/plugins/deploy/submission)
and [retention of approved tool definitions during continuous review](https://developers.openai.com/plugins/deploy/app-review).
