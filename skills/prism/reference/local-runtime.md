# Local Windows runtime

This machine already has Playwright 1.61.1 under
`C:/Users/thest/Downloads/subagent/node_modules`. If the current trusted project
does not have Playwright, set the following only for the verification command's
process environment, not globally:

```powershell
$env:PRISM_PW = 'C:/Users/thest/Downloads/subagent'
node 'C:/Users/thest/.codex/skills/prism/driver.mjs' 'http://127.0.0.1:5173' --out './prism-verify-new'
```

Use a new/empty output directory. The checker launches sandboxed Microsoft Edge
on Windows with a fresh browser context, not the user's signed-in profile.
If this dependency location is removed, install a reviewed Playwright version in
the project instead. Linux needs an installed Playwright Chromium browser.
This local setup was tested on Windows; no Linux runtime claim is made here.
