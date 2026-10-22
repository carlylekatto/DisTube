# Publishing

The fork is published on npm as `@kattowo/distube`. The name `distube` belongs to the upstream
repository, so the scope of the author is used instead.

The publish uses the trusted publishing of npm: the workflow authenticates with a token that GitHub
signs for the run, and npm accepts it because the package trusts that workflow. There is no npm
token in the repository, and there is no secret to keep.

## The first release

The scope does not exist yet. The first publish creates it, and the trusted publisher of the package
has to be set up before that.
1. Sign in to [npmjs.com](https://www.npmjs.com/) as `kattowo`.
2. Open the package, go to **Settings → Trusted Publisher**, and add a GitHub Actions publisher:

   | Field                | Value          |
   | -------------------- | -------------- |
   | Organization or user | `carlylekatto` |
   | Repository           | `DisTube`      |
   | Workflow filename    | `publish.yml`  |
   | Environment name     | leave it empty |
   | Allowed actions      | `npm publish`  |

   The workflow filename is the name of the file only, without the path. Every field is case
   sensitive, and npm does not check them when they are saved, so a typo only shows up when the
   publish runs.

   The trusted publisher has to complete its first publish within two days, or it expires. If that
   happens, delete it and add it again.

3. Create the release on GitHub, and the `Publish distube` workflow does the rest:

   ```bash
   git tag v6.0.0
   git push --tags
   gh release create v6.0.0 --title "6.0.0" --generate-notes
   ```

The workflow lints the code, runs the tests, builds the package, and publishes it with a provenance
attestation, which npm generates on its own when the publish comes from a trusted publisher.

## The version

The version lives in `package.json`, and the build writes it into the bundle with
`esbuild-plugin-version-injector`. The tag of the release and the version of the package have to
match.

## The repository of the package

npm checks that the `repository.url` of the package is the repository that publishes it. The fork
points at `git+https://github.com/carlylekatto/DisTube.git`, which is where the workflow runs.

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

## After the first publish

The package settings of npmjs.com can then close the door on the tokens: **Settings → Publishing
access → Require two-factor authentication and disallow tokens**. The trusted publisher keeps
working, since it does not use a token.

There is also a staged publishing, where `npm stage publish` waits for an approval before the
package becomes public. The workflow of the fork publishes directly, so it needs the `npm publish`
permission in the trusted publisher.
