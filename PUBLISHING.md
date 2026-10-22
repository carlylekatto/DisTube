# Publishing

The fork is published on npm as `@kattowo/distube`. The name `distube` belongs to the upstream
repository, so the scope of the author is used instead.

The publish uses the trusted publishing of npm: the workflow authenticates with a token that GitHub
signs for the run, and npm accepts it because the package trusts that workflow. There is no npm
token in the repository, and there is no secret to keep.

## The first release

The scope and the package did not exist. The version 6.0.0 was published by hand, since npm wants
the package to exist before it accepts a trusted publisher:

```bash
npm login
npm publish --access public
```

`npm login` asks for the account `kattowo` and for the two factor code. The publish runs the
`prepublishOnly` script, which lints the code and runs the tests, and the `prepack` script, which
builds the package. That version has no provenance attestation, since npm only writes one for a
publish that comes from a supported CI provider.

## The trusted publisher

The command needs the npm client 11.15.0 or later, and the two factor authentication of the
account:

```bash
npm install -g npm@^11.15.0
npm trust github @kattowo/distube --file publish.yml --repo carlylekatto/DisTube --allow-publish --allow-stage-publish
```

The `--allow-publish` flag is what lets the workflow run `npm publish`, and `--allow-stage-publish`
is what lets it run `npm stage publish`. The `--file` flag is the name of the workflow file,
without the path. The `--repo` flag is the repository in the `owner/repo` shape, and it can be left
out, since npm reads the `repository.url` of the package.

The same thing can be done on the website of npm, under **Settings → Trusted Publisher** of the
package. The fields are the same, and npm does not check them when they are saved, so a typo only
shows up when the publish runs.

A trusted publisher has to complete its first publish within two days, or it expires. If that
happens, remove it with `npm trust revoke` and add it again.

## The releases

From now on, the workflow does the publishing. A tag is the trigger: it publishes the version, and
it creates the release of it with the notes of the changelog.

```bash
npm version 6.0.1
git push fork main --tags
```

The command bumps the version of `package.json`, creates the tag and commits both. The tag has no `v`
in front, like the other tags of the repository. The version of the package and the tag have to
match, and the workflow stops when they do not.

The workflow stages the version instead of publishing it. The version waits on the registry, and
it becomes public when it is approved:

```bash
npm stage list @kattowo/distube
npm stage approve <id>
```

The approval asks for the two factor authentication of the account. To skip the wait, the workflow
has an input for it, and the version goes out right away:

```bash
gh workflow run publish.yml -f publish=true
```

The workflow lints the code, runs the tests, builds the package, and stages it. The provenance
attestation is written by npm on its own, since the publish comes from a trusted publisher.

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

The package settings of npmjs.com can close the door on the tokens: **Settings → Publishing
access → Require two-factor authentication and disallow tokens**. The trusted publisher keeps
working, since it does not use a token.

The approval of a staged version needs the two factor authentication of the account. From the
command line it uses the session of `npm login`, which the setting above does not allow any more,
so approve it on the website of npm, where the session comes from the browser.

There is also the choice of publishing the version right away, without the wait of an approval. The
workflow does it when it runs with the `publish` input, and the trusted publisher needs the
`npm publish` permission for it.
