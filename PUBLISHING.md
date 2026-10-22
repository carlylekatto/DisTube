# Publishing

The fork is published on npm as `@kattowo/distube`. The name `distube` belongs to the upstream
repository, so the scope of the author is used instead.

## The first release

The scope does not exist yet. The first publish creates it.
1. Sign in to [npmjs.com](https://www.npmjs.com/) as `kattowo`.
2. Create an automation token: **Access Tokens → Generate New Token → Automation**. The token
   publishes the scope.
3. Add it to the repository: **Settings → Secrets and variables → Actions → New repository secret**,
   with the name `NPM_TOKEN`.

Then create a release on GitHub, and the `Publish distube` workflow does the rest. It builds the
package, publishes it with the public access, and signs it with a provenance attestation.

```bash
git tag v6.0.0
git push --tags
gh release create v6.0.0 --title "6.0.0" --generate-notes
```

## The version

The version lives in `package.json`, and the build writes it into the bundle with
`esbuild-plugin-version-injector`. The tag of the release and the version of the package have to
match.

## The dependencies of a user

A user installs the library and the two peer dependencies:

```bash
npm install @kattowo/distube @discordjs/voice @discordjs/opus
```

`@discordjs/voice` has to be 0.19.1 or later. Discord made the DAVE encryption mandatory in March
2026, and the library asks for it explicitly.

## A bot that keeps the name

A bot that wants `require("distube")` depends on the package through an npm alias:

```json
{
  "dependencies": {
    "distube": "npm:@kattowo/distube@^6.0.0"
  }
}
```

The alias installs the package under the name `distube`, so the code of the bot does not change.
