---
'meta-sovereign': minor
---

R-R1..R-R18: Add GitHub as the eleventh first-class `MessageSource`.
The new `js/src/sources/github.js` adapter normalises issues, issue
comments, pull requests, PR review comments, reviews, and discussions
into `msg:github:<external_id>` links via `buildMessageLink()`. It
ships both an archive importer (raw `gh api` array dumps and the
standard `{issues, pulls, comments, reviewComments, reviews,
discussions}` envelope) and a live REST client with `Bearer` auth,
`Link: rel="next"` pagination, and an injectable `fetchImpl` for
tests. The live surface adds `pullMessages` (issues → comments → PRs
→ review comments → reviews), `listRepos` over `/user/repos`,
`cloneRepo` that downloads the repo tarball, gunzips it with
`node:zlib`, walks USTAR/PAX entries, and writes one
`repo:<owner>/<name>:file:<path>` link per file plus a
`repo:<owner>/<name>` index link with metadata children, and `post`
for creating issue/PR comments. CLI gains `github-clone` and
`github-comment`; `source-pull --source=github` forwards `owner`,
`repo`, and `state`. The JS server adds same-origin proxy routes
`POST /api/github/pull|clone|post-comment` so the SPA stays useful
when CORS blocks browser-direct calls. The connection guide catalogue
exposes a GitHub provider entry that probes `https://api.github.com/user`
and persists the PAT in `secret:github:access-token`. Tests live in
`js/tests/github-source.test.js`. The full atomic requirement list
and solution plan live under `docs/case-studies/issue-5/`.
