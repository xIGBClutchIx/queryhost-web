const PACKAGE_MANIFESTS = import.meta.glob<string>(
  "../../node_modules/queryhost/package.json",
  { eager: true, import: "default", query: "?raw" },
);

const manifest = Object.values(PACKAGE_MANIFESTS)[0];
const version =
  manifest === undefined
    ? undefined
    : /"version"\s*:\s*"([0-9A-Za-z.+-]+)"/.exec(manifest)?.[1];
if (version === undefined) {
  throw new Error("The installed QueryHost package version is missing.");
}

/** Version of the installed `queryhost` package that the site documents. */
export const QUERYHOST_VERSION: string = version;
