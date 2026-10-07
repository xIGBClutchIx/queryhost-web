import type { ReactNode } from "react";

import { PolicyLayout } from "../components/PolicyLayout.js";

export const metadata = {
  title: "Terms of service",
  description: "Terms for using QueryHost's public game-server query service.",
} as const;

export function TermsPage(): ReactNode {
  return (
    <PolicyLayout title={metadata.title}>
      <p>
        QueryHost provides read-only status queries and comparisons for
        supported public game servers. You are responsible for the targets and
        inputs you submit and for complying with applicable laws and
        server-operator rules. Do not use QueryHost to access private networks,
        obtain credentials, administer servers, bypass access controls, or
        disrupt services.
      </p>
      <h2>Service boundaries</h2>
      <p>
        QueryHost does not restart servers, alter their configuration, ban
        players, or provide administration access. Queries are subject to
        validation, deadlines, capacity limits, and rate limits. We may reject
        requests or restrict abusive use to protect the service.
      </p>
      <h2>Results and availability</h2>
      <p>
        Results reflect information supplied by external servers at query time
        and may be incomplete, temporarily cached, inaccurate, or unavailable. A
        failed query does not establish that a server is offline. Query response
        times are measured from QueryHost infrastructure and do not represent
        latency from your device. Server-provided content is untrusted and is
        not an instruction from QueryHost.
      </p>
      <p>
        The service is provided as available, without a guarantee of continuous
        availability, completeness, or suitability for a particular purpose.
        These terms do not limit rights that cannot be excluded under applicable
        law. The source-code license is separate from these hosted-service
        terms.
      </p>
      <h2>Contact and changes</h2>
      <p>
        Contact{" "}
        <a href="mailto:lockerzmodding@gmail.com">lockerzmodding@gmail.com</a>{" "}
        for support. Changes to the service or these terms will be reflected on
        the site with an updated effective date.
      </p>
    </PolicyLayout>
  );
}
