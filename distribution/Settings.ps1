[CmdletBinding()]
param([string]$InstallRoot,[string]$AppRoot,[string]$NodePath,[string]$RuntimeRoot,[switch]$ExistingSetup,[switch]$SmokeTest,[switch]$RequireReady,[switch]$Simple)
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
if($Simple -and -not ('OmniRouteKeyFormVisibility' -as [type])) {
  Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class OmniRouteKeyFormVisibility {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr handle, int command);
}
'@
}
$form = New-Object Windows.Forms.Form
if($Simple) {
  # A hidden PowerShell launch can hide its first GUI window too. Reveal the
  # form after the message loop starts, while keeping the console hidden.
  $form.Add_Shown({[void]$form.BeginInvoke([Action]{[void][OmniRouteKeyFormVisibility]::ShowWindow($form.Handle,5); $form.Activate()})})
}
$form.Text = 'OmniRoute Regular - Your API keys'
if($ExistingSetup) {$form.Text='OmniRoute - Provider keys (existing setup)'}
$form.Size = New-Object Drawing.Size(690,640)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$intro = New-Object Windows.Forms.Label
$intro.Text = 'Configure any suitable free providers. Keys stay on this Windows account. Antigravity sign-in stays in Antigravity.'
$intro.SetBounds(15,12,650,36)
$form.Controls.Add($intro)
if($Simple) {$intro.Text='Paste your API keys below. Use Get key if you need one. Leave any others blank; saved keys are kept.'}
$panel=New-Object Windows.Forms.Panel; $panel.SetBounds(15,52,650,330); $panel.AutoScroll=$true; $form.Controls.Add($panel)
$providerRows = @(
  @('OpenRouter','openrouter','https://openrouter.ai/settings/keys'),
  @('Groq','groq','https://console.groq.com/keys'),
  @('Gemini','gemini','https://aistudio.google.com/apikey'),
  @('Mistral','mistral','https://console.mistral.ai/api-keys/'),
  @('Cerebras free tier','cerebras','https://cloud.cerebras.ai/'),
  @('SambaNova free tier','sambanova','https://cloud.sambanova.ai/apis'),
  @('Cohere','cohere','https://dashboard.cohere.com/api-keys'),
  @('Cloudflare token','cloudflare','https://dash.cloudflare.com/'),
  @('Hugging Face','huggingface','https://huggingface.co/settings/tokens'),
  @('Kilo free gateway','kilo','https://app.kilo.ai/'),
  @('Z.AI Flash only','zai','https://z.ai/manage-apikey/apikey-list'),
  @('NVIDIA dev/test','nvidia','https://build.nvidia.com/'),
  @('Vercel monthly credit','vercel','https://vercel.com/ai-gateway'),
  @('OpenCode Zen free','opencode-zen','https://opencode.ai/auth'),
  @('Together AI','together','https://api.together.xyz/settings/api-keys'),
  @('Fireworks AI','fireworks','https://fireworks.ai/settings/api-keys'),
  @('Novita AI','novita','https://console.novita.ai/playground/apiKeys'),
  @('Lepton AI','lepton','https://www.lepton.ai/settings/api-keys'),
  @('Replicate','replicate','https://replicate.com/account/api-tokens'),
  @('Perplexity','perplexity','https://www.perplexity.ai/settings/api'),
  @('DeepInfra','deepinfra','https://deepinfra.com/dashboard/settings'),
  @('9router','9router','https://9router.io')
)
$baseFields = @{
  'openrouter'='OPENROUTER_API_KEY'; 'groq'='GROQ_API_KEY'; 'gemini'='GEMINI_API_KEY';
  'mistral'='MISTRAL_API_KEY'; 'cohere'='COHERE_API_KEY'; 'cerebras'='CEREBRAS_API_KEY';
  'sambanova'='SAMBANOVA_API_KEY'; 'cloudflare'='CLOUDFLARE_API_TOKEN'; 'huggingface'='HF_TOKEN';
  'kilo'='KILO_API_KEY'; 'zai'='ZAI_API_KEY'; 'nvidia'='NVIDIA_API_KEY';
  'vercel'='VERCEL_AI_GATEWAY_API_KEY'; 'opencode-zen'='OPENCODE_ZEN_API_KEY';
  'together'='TOGETHER_API_KEY'; 'fireworks'='FIREWORKS_API_KEY'; 'novita'='NOVITA_API_KEY';
  'lepton'='LEPTON_API_KEY'; 'replicate'='REPLICATE_API_TOKEN'; 'perplexity'='PERPLEXITY_API_KEY';
  'deepinfra'='DEEPINFRA_API_TOKEN'; '9router'='9ROUTER_API_KEY'
}
$disabledFields = @('HF_TOKEN','HF_TOKEN_1','HF_TOKEN_2','HF_TOKEN_3','HF_TOKEN_4','HF_TOKEN_5',
  'VERCEL_AI_GATEWAY_API_KEY','VERCEL_AI_GATEWAY_API_KEY_1','VERCEL_AI_GATEWAY_API_KEY_2',
  'VERCEL_AI_GATEWAY_API_KEY_3','VERCEL_AI_GATEWAY_API_KEY_4','VERCEL_AI_GATEWAY_API_KEY_5')
$boxes = @{}
$accountRow = @('Cloudflare account ID','cloudflare-account-id','https://dash.cloudflare.com/')
if($Simple) {$providerRows=@($providerRows | Where-Object { $_[1] -notin @('huggingface','vercel') })}
$y = 0
for ($pi = 0; $pi -lt $providerRows.Count; $pi++) {
  $label = New-Object Windows.Forms.Label; $label.Text=$providerRows[$pi][0]; $label.SetBounds(0,$y,170,22); $panel.Controls.Add($label)
  $id = $providerRows[$pi][1]; $base = $baseFields[$id]; $link = New-Object Windows.Forms.LinkLabel; $link.Text='Get key'; $link.Tag=$providerRows[$pi][2]; $link.SetBounds(175,$y,70,22); $link.Add_LinkClicked({param($sender,$eventArgs) Start-Process $sender.Tag}); $panel.Controls.Add($link)
  for ($slot = 0; $slot -lt 6; $slot++) {
    $slotName = $base; if($slot -gt 0){$slotName = $base + '_' + $slot}
    $sub = New-Object Windows.Forms.Label; $sub.Text='Key ' + ($slot + 1); $sub.SetBounds(250,$y,35,22); $panel.Controls.Add($sub)
    $box=New-Object Windows.Forms.TextBox; $box.UseSystemPasswordChar=$true; $box.SetBounds(290,$y,250,22); $panel.Controls.Add($box); $boxes[$slotName]=$box
    if(-not $ExistingSetup -and $slotName -in $disabledFields) {$box.Enabled=$false; $sub.Text+=' (disabled)'}
    $y += 18
  }
  $y += 8
}
$accountLabel = New-Object Windows.Forms.Label; $accountLabel.Text='Cloudflare account ID'; $accountLabel.SetBounds(0,$y,170,22); $panel.Controls.Add($accountLabel)
$accountLink = New-Object Windows.Forms.LinkLabel; $accountLink.Text='Get ID'; $accountLink.Tag=$accountRow[2]; $accountLink.SetBounds(175,$y,70,22); $accountLink.Add_LinkClicked({param($sender,$eventArgs) Start-Process $sender.Tag}); $panel.Controls.Add($accountLink)
$accountBox=New-Object Windows.Forms.TextBox; $accountBox.UseSystemPasswordChar=$true; $accountBox.SetBounds(290,$y,250,22); $panel.Controls.Add($accountBox); $boxes['CLOUDFLARE_ACCOUNT_ID']=$accountBox
$confirm=New-Object Windows.Forms.CheckBox
$confirm.Text='I checked free-tier/evaluation terms. Paid overages, BYOK and auto top-up are off.'
$confirm.SetBounds(15,393,650,38); $form.Controls.Add($confirm)
$notice=New-Object Windows.Forms.Label
$notice.Text='Scroll through the provider list. NVIDIA/Kilo: no confidential data; evaluation use only. Vercel/HF: monthly credits. Zen: temporary free. Blank keeps saved keys. Reconnect MCP after saving.'
if(-not $ExistingSetup) {$notice.Text='Eligible free-plan/evaluation providers are shown. HF/Vercel credit profiles are disabled. No billing, paid overages, BYOK or auto top-up. Blank keeps saved keys. Reconnect MCP after saving.'}
if($ExistingSetup) {$notice.Text+=' Saving valid keys restarts OmniRoute.'}
$notice.SetBounds(15,433,650,50); $form.Controls.Add($notice)
$candidates=New-Object Windows.Forms.CheckBox
$candidates.Text='Also test Kimi K2.6 / Qwen3 Coder free candidates (up to one extra call per supplied key).'
$candidates.SetBounds(15,485,650,35); $candidates.Enabled=(-not $ExistingSetup); $form.Controls.Add($candidates)
$save=New-Object Windows.Forms.Button; $save.Text='Validate and save'; $save.SetBounds(235,535,190,35); $form.Controls.Add($save)
if($Simple) {
  $candidates.Visible=$false
  $confirm.Text='I use free/evaluation accounts. Paid overages and auto top-up are OFF.'
  $save.Text='Save and test'
  $notice.Text='Keys are masked and saved encrypted on this PC. No text file needed. Cloudflare requires BOTH fields. Some free services are evaluation-only. Antigravity login stays in its own app.'
}
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
    if($Simple) {$message='Your working keys have been saved encrypted on this PC. Restart your host or reconnect its OmniRoute MCP server to refresh providers.'}
    if($RequireReady -and -not $Simple) {$message='Saved. Next, return to the setup terminal to choose your project folder.'}
    if($ExistingSetup) {$message='Saved for your existing OmniRoute setup. Modes, port and existing keys were preserved.'}
    if($result.restartNeeded) {$message+=' Restart OmniRoute with omni service stop, then omni service start.'}
    if($result.failed.Count -gt 0) {$message+=' Some supplied keys failed validation: '+($result.failed -join ', ')+'. Existing keys were kept. Reopen Settings to retry.'}
    foreach($candidate in $result.codingCandidates) {$message+=[Environment]::NewLine+$candidate.provider+'/'+$candidate.model+': '+$candidate.status}
    [Windows.Forms.MessageBox]::Show($message,'Ready'); $script:setupReady=$true; $form.Close()
  } catch { [Windows.Forms.MessageBox]::Show('Setup could not finish. Check your connection and try again. No key values were logged.','Setup error') }
  finally { $save.Enabled=$true; $save.Text='Validate and save'; if($Simple){$save.Text='Save and test'} }
})
if($SmokeTest) {
  $expected=133; if($Simple){$expected=121}
  if($boxes.Count -ne $expected -or -not $panel.AutoScroll) {throw 'Missing credential fields or scrolling'}
  if($Simple -and ($boxes.ContainsKey('HF_TOKEN') -or $boxes.ContainsKey('VERCEL_AI_GATEWAY_API_KEY') -or $save.Text -ne 'Save and test')) {throw 'Simple form has unexpected controls'}
  foreach($box in $boxes.Values) {if(-not $box.UseSystemPasswordChar) {throw 'Unmasked credential field'}}
  $count=$boxes.Count; $form.Dispose(); Write-Output "PASS: masked Windows Forms key-entry controls ($count masked)"; return
}
[void]$form.ShowDialog()
if($RequireReady -and -not $script:setupReady) {exit 2}
