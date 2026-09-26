---
name: github-package-release
description: Prepare or publish versioned GitHub release packages and source archives without pushing unrelated branch changes. Use when a user asks to distribute a build through GitHub.
---

# GitHub package release

Keep preparation separate from publication. A request to build, prepare, or package is not permission to publish. If the user says not to push yet, do not create or edit a GitHub release, tag, branch, or remote file.

## Prepare safely

1. Inspect repository instructions, the remote, default branch, current branch, local status, package version, and existing tags/releases. Preserve user changes. Do not push a work branch just because it contains the package; it may also be ahead or dirty with unrelated source edits.
2. Identify exactly which deliverables the user requested: installer, checksum, README, and/or a source archive. Reuse a verified package when it matches the current source; otherwise build a new version. Never overwrite a previously sealed release artifact or reuse an occupied version/tag.
3. If a source archive is requested, make it from the source snapshot that corresponds to the package. Include intended local source changes when they are part of that build and record the base revision. Exclude .git, release/build outputs, dependencies, caches, test artifacts, credentials, tokens, keys, vaults, browser profiles, logs, runtime state, and .env files (except explicitly safe examples). Inspect the archive listing and scan for sensitive files before sharing it.
4. Make the root README a short, plain-language entry point. Link to the actual release, state which operating systems/package files are included, explain the few user steps, list important limits, and distinguish the installer from any optional source ZIP. Keep detailed technical notes in their existing docs.
5. Verify local archive integrity and checksums. Confirm the installer and source archive contain the intended version and skill bundle, and that no secrets or personal sessions are included.

## Authenticate and publish

1. Publish only after the user explicitly authorizes the external write. Check gh auth status and verify the authenticated identity with gh api user. Do not print, retrieve, or store an access token in chat, logs, files, or worker prompts.
2. If GitHub authentication needs repair, use the CLI's device flow only when the user asks or agrees to reauthenticate. Show the short-lived code and the official https://github.com/login/device link to the user only, wait for their approval, then verify identity again. Do not enter credentials for them.
3. Prefer a versioned GitHub Release for large downloadable archives. Update the root README separately and narrowly when requested; never push the current working branch if it would include unrelated commits or files. Preserve the repository's default branch and its existing content.
4. Do not delete or silently replace an existing tag, release, or asset. If the target version/name already exists, stop and ask or use a new version with the user's agreement.
5. After upload, verify the release/tag, each asset name and size, and the remote SHA-256 against the local file. Verify any README change on the default branch. Report exact links and distinguish uploaded assets from files that remain local.

Never treat this skill as publication authorization. Do not send credentials or authentication data to OmniRoute or any other worker. Follow repository instructions and the user's latest scope if they are more restrictive.
