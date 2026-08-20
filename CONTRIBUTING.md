# Contributing to Handout

Handout is a self-hosted service that turns a finished HTML artifact into a shareable
URL. It is licensed under Apache-2.0 (see [`LICENSE`](LICENSE)).

## Sign off your commits

There is no Contributor License Agreement here, and none will be asked for. Instead every
commit needs a `Signed-off-by` trailer, produced by `git commit -s`. The trailer transfers
no rights — it records, per commit, that you are entitled to submit the work under this
project's licence. The text you are certifying is the Developer Certificate of Origin
below.

If you forgot it: `git commit --amend -s` fixes the last commit, `git rebase --signoff
main` fixes a whole branch.

Three layers enforce this, in order of how early they catch a missing trailer:

- `git commit -s` is the act itself.
- The hook in `.husky/` is an early warning: it appends the trailer for you after an
  `npm install` in your clone. `--no-verify` does **not** bypass it — `prepare-commit-msg`
  is exempt from that flag by design (`githooks(5)`); the actual way around it is
  `HUSKY=0 git commit …`, or simply not having run `npm install` yet.
- **The check on the pull request is the rule**, and nobody skips it. Run it yourself
  before pushing: `bash scripts/check-signoff.sh main HEAD`.

### Developer Certificate of Origin

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

## Before you open a pull request

Run `npm run check`, and `npm run verify` when both servers are up. Everything in the
repository is written in English. See [`README.md`](README.md) for how to run the project.

## A commercial fork is possible

The maintainer may build a proprietary derivative work of this code. Apache-2.0 §5 means
a contribution arrives already carrying that permission, which is why no CLA is needed.
The same permission belongs to everyone who receives the code, including a competitor.
The open project itself stays under Apache-2.0 and is not relicensed.

## The name

Apache-2.0 grants no rights in the "Handout" name or any logo — see
[`TRADEMARKS.md`](TRADEMARKS.md).
