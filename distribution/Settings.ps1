[CmdletBinding()]
param([string]$InstallRoot,[string]$AppRoot,[string]$NodePath,[string]$RuntimeRoot,[switch]$ExistingSetup,[switch]$SmokeTest,[switch]$RequireReady)
$ErrorActionPreference = 'Stop'
$script:setupReady=$false
if(-not $InstallRoot) {$InstallRoot=$PSScriptRoot}
if(-not $AppRoot -and (Test-Path -LiteralPath (Join-Path $InstallRoot 'active-version.txt'))) {
  $active=(Get-Content -LiteralPath (Join-Path $InstallRoot 'active-version.txt') -Raw).Trim()
  if($active -notmatch '^versions/[a-zA-Z0-9.-]+$') {throw 'Invalid active version'}
  $AppRoot=Join-Path $InstallRoot ($active+'/app')
  if(-not $NodePath) {$NodePath=Join-Path $InstallRoot ($active+'/node/node.exe')}
}
if(-not $AppRoot) {$AppRoot=Join-Path $InstallRoot 'app'}
if(-not $NodePath) {$NodePath=Join-Path $InstallRoot 'node\node.exe'}
if(-not $RuntimeRoot) {$RuntimeRoot=Join-Path $InstallRoot 'data'}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = New-Object Windows.Forms.Form
$form.Text = 'OmniRoute Regular - Your API keys'
if($ExistingSetup) {$form.Text='OmniRoute - Provider keys (existing setup)'}
$form.Size = New-Object Drawing.Size(690,640)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$intro = New-Object Windows.Forms.Label
$intro.Text = 'Any one suitable free provider is enough. Keys stay on this Windows account. Antigravity sign-in stays in Antigravity.'
$intro.SetBounds(15,12,650,36)
$form.Controls.Add($intro)
$panel=New-Object Windows.Forms.Panel; $panel.SetBounds(15,52,650,330); $panel.AutoScroll=$true; $form.Controls.Add($panel)
$rows = @(
  @('OpenRouter','OPENROUTER_API_KEY','https://openrouter.ai/settings/keys'),
  @('Groq','GROQ_API_KEY','https://console.groq.com/keys'),
  @('Gemini','GEMINI_API_KEY','https://aistudio.google.com/apikey'),
  @('Mistral','MISTRAL_API_KEY','https://console.mistral.ai/api-keys/'),
  @('Cohere','COHERE_API_KEY','https://dashboard.cohere.com/api-keys'),
  @('Cloudflare token','CLOUDFLARE_API_TOKEN','https://dash.cloudflare.com/'),
  @('Cloudflare account ID','CLOUDFLARE_ACCOUNT_ID','https://dash.cloudflare.com/'),
  @('Hugging Face','HF_TOKEN','https://huggingface.co/settings/tokens'),
  @('Kilo free gateway','KILO_API_KEY','https://app.kilo.ai/'),
  @('Z.AI Flash only','ZAI_API_KEY','https://z.ai/manage-apikey/apikey-list'),
  @('NVIDIA dev/test','NVIDIA_API_KEY','https://build.nvidia.com/'),
  @('Vercel monthly credit','VERCEL_AI_GATEWAY_API_KEY','https://vercel.com/ai-gateway'),
  @('OpenCode Zen free','OPENCODE_ZEN_API_KEY','https://opencode.ai/auth')
)
$boxes = @{}
for ($i=0; $i -lt $rows.Count; $i++) {
  $label=New-Object Windows.Forms.Label; $label.Text=$rows[$i][0]; $label.SetBounds(0,(3+$i*42),150,25); $panel.Controls.Add($label)
  $box=New-Object Windows.Forms.TextBox; $box.UseSystemPasswordChar=$true; $box.SetBounds(155,($i*42),370,26); $panel.Controls.Add($box); $boxes[$rows[$i][1]]=$box
  $link=New-Object Windows.Forms.LinkLabel; $link.Text='Get key'; $link.Tag=$rows[$i][2]; $link.SetBounds(540,(3+$i*42),75,25)
  $link.Add_LinkClicked({param($sender,$eventArgs) Start-Process $sender.Tag}); $panel.Controls.Add($link)
}
$confirm=New-Object Windows.Forms.CheckBox
$confirm.Text='I checked free-tier/evaluation terms. Paid overages, BYOK and auto top-up are off.'
$confirm.SetBounds(15,393,650,38); $form.Controls.Add($confirm)
$notice=New-Object Windows.Forms.Label
$notice.Text='Scroll for all 12 providers. NVIDIA/Kilo: no confidential data; evaluation use only. Vercel/HF: monthly credits. Zen: temporary free. Blank keeps saved keys. Reconnect MCP after saving.'
if($ExistingSetup) {$notice.Text+=' Saving valid keys restarts OmniRoute.'}
$notice.SetBounds(15,433,650,50); $form.Controls.Add($notice)
$candidates=New-Object Windows.Forms.CheckBox
$candidates.Text='Also test Kimi K2.6 / Qwen3 Coder free candidates (up to one extra call per supplied key).'
$candidates.SetBounds(15,485,650,35); $candidates.Enabled=(-not $ExistingSetup); $form.Controls.Add($candidates)
$save=New-Object Windows.Forms.Button; $save.Text='Validate and save'; $save.SetBounds(235,535,190,35); $form.Controls.Add($save)
$save.Add_Click({
  if(-not $confirm.Checked) { [Windows.Forms.MessageBox]::Show('Confirm free-only account settings first.'); return }
  $save.Enabled=$false; $save.Text='Checking keys...'; $form.Refresh()
  try {
    $keys=@{}; foreach($name in $boxes.Keys) {$keys[$name]=$boxes[$name].Text}
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=$NodePath
    $backend=Join-Path $AppRoot 'distribution\settings.mjs'
    $info.Arguments='"'+$backend+'"'; $info.UseShellExecute=$false; $info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true; $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
    if($ExistingSetup) {$info.Arguments+=' --existing --restart'}
    $info.EnvironmentVariables['OMNIROUTE_HOME']=$RuntimeRoot
    $process=New-Object Diagnostics.Process; $process.StartInfo=$info; [void]$process.Start()
    $process.StandardInput.Write((@{keys=$keys;freeOnlyConfirmed=$true;validateCodingCandidates=$candidates.Checked} | ConvertTo-Json -Compress)); $process.StandardInput.Close()
    $errorTask=$process.StandardError.ReadToEndAsync()
    $outputTask=$process.StandardOutput.ReadToEndAsync()
    while(-not $process.HasExited) { [Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 100 }
    $result=$outputTask.Result | ConvertFrom-Json
    if($process.ExitCode -ne 0 -or -not $result.ready) { [Windows.Forms.MessageBox]::Show($result.error,'Setup needs attention'); return }
    foreach($box in $boxes.Values) {$box.Clear()}; $keys.Clear()
    $message='Saved. Open the OmniRoute Regular desktop shortcut.'
    if($RequireReady) {$message='Saved. Next, return to the setup terminal to choose your project folder.'}
    if($ExistingSetup) {$message='Saved for your existing OmniRoute setup. Modes, port and existing keys were preserved.'}
    if($result.restartNeeded) {$message+=' Restart OmniRoute with omni service stop, then omni service start.'}
    if($result.failed.Count -gt 0) {$message+=' Some supplied keys failed validation: '+($result.failed -join ', ')+'. Existing keys were kept. Reopen Settings to retry.'}
    foreach($candidate in $result.codingCandidates) {$message+=[Environment]::NewLine+$candidate.provider+'/'+$candidate.model+': '+$candidate.status}
    [Windows.Forms.MessageBox]::Show($message,'Ready'); $script:setupReady=$true; $form.Close()
  } catch { [Windows.Forms.MessageBox]::Show('Setup could not finish. Check your connection and try again. No key values were logged.','Setup error') }
  finally { $save.Enabled=$true; $save.Text='Validate and save' }
})
if($SmokeTest) {
  if($boxes.Count -ne 13 -or -not $panel.AutoScroll) {throw 'Missing credential fields or scrolling'}
  foreach($box in $boxes.Values) {if(-not $box.UseSystemPasswordChar) {throw 'Unmasked credential field'}}
  $form.Dispose(); Write-Output 'PASS: masked Windows Forms key-entry controls'; return
}
[void]$form.ShowDialog()
if($RequireReady -and -not $script:setupReady) {exit 2}
