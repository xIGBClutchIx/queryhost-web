import type { APIRoute } from "astro";

import { usageReportDependencies } from "../../server/query-dependencies.js";
import { handleUsageReport } from "../../server/usage-report.js";

export const ALL: APIRoute = ({ request }) =>
  handleUsageReport(request, usageReportDependencies());
