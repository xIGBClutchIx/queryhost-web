# QueryHost package snapshot

`queryhost-0.0.0.tgz` is the private package artifact consumed by this web build. It was copied from the API's verified snapshot of library commit `a12438926bc9aa4d338b17e8c02831cba8ad31e0`.

The artifact provides the exported game registry and generated TypeDoc Markdown. The web repository renders those package-owned sources and does not maintain a second game list or API contract.

To refresh after a verified library change:

```bash
cd ../query
npm run verify
npm pack --pack-destination ../web/vendor
cd ../web
npm install
npm run verify
```

Update this file with the source commit whenever the artifact changes.
