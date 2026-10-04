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
$form.Size = New-Object Drawing.Size(1080,680)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$intro = New-Object Windows.Forms.Label
$intro.Text = 'Configure any suitable free providers. Keys stay on this Windows account. Antigravity sign-in stays in Antigravity.'
$intro.SetBounds(15,12,1030,36)
$form.Controls.Add($intro)
if($Simple) {$intro.Text='Paste your API keys below. Use Get key if you need one. Leave any others blank; saved keys are kept.'}
$panel=New-Object Windows.Forms.Panel; $panel.SetBounds(15,52,1030,370); $panel.AutoScroll=$true; $form.Controls.Add($panel)
$rows = @(
  @('OpenRouter','OPENROUTER_API_KEY','https://openrouter.ai/settings/keys','openrouter'),
  @('Groq','GROQ_API_KEY','https://console.groq.com/keys','groq'),
  @('Gemini','GEMINI_API_KEY','https://aistudio.google.com/apikey','gemini'),
  @('Mistral','MISTRAL_API_KEY','https://console.mistral.ai/api-keys/','mistral'),
  @('Cerebras free tier','CEREBRAS_API_KEY','https://cloud.cerebras.ai/','cerebras'),
  @('SambaNova free tier','SAMBANOVA_API_KEY','https://cloud.sambanova.ai/apis','sambanova'),
  @('Cohere','COHERE_API_KEY','https://dashboard.cohere.com/api-keys','cohere'),
  @('Cloudflare token','CLOUDFLARE_API_TOKEN','https://dash.cloudflare.com/','cloudflare'),
  @('Cloudflare account ID','CLOUDFLARE_ACCOUNT_ID','https://dash.cloudflare.com/','cloudflare'),
  @('Hugging Face','HF_TOKEN','https://huggingface.co/settings/tokens','huggingface'),
  @('Kilo free gateway','KILO_API_KEY','https://app.kilo.ai/','kilo'),
  @('Z.AI Flash only','ZAI_API_KEY','https://z.ai/manage-apikey/apikey-list','zai'),
  @('NVIDIA dev/test','NVIDIA_API_KEY','https://build.nvidia.com/','nvidia'),
  @('Vercel monthly credit','VERCEL_AI_GATEWAY_API_KEY','https://vercel.com/ai-gateway','vercel'),
  @('OpenCode Zen free','OPENCODE_ZEN_API_KEY','https://opencode.ai/auth','opencode-zen')
)
$boxes = @{}
$statusLabels = @{}
$statusBase = @{}
$replaceChecks = @{}
$providerStatusAdded = @{}
if($Simple) {$rows=@($rows | Where-Object {$_[1] -notin @('HF_TOKEN','VERCEL_AI_GATEWAY_API_KEY')})}
for($slot=1;$slot -le 5;$slot++) {$heading=New-Object Windows.Forms.Label;$heading.Text='Slot '+$slot;$heading.SetBounds((155+($slot-1)*160),0,145,22);$panel.Controls.Add($heading)}
for ($i=0; $i -lt $rows.Count; $i++) {
  $rowHeight=42; if($ExistingSetup) {$rowHeight=65}
  $y=25+$i*$rowHeight
  $label=New-Object Windows.Forms.Label; $label.Text=$rows[$i][0]; $label.SetBounds(0,(3+$y),150,25); $panel.Controls.Add($label)
  $providerId=$rows[$i][3]
  for($slot=1;$slot -le 5;$slot++) {
    $x=155+($slot-1)*160
    $box=New-Object Windows.Forms.TextBox; $box.UseSystemPasswordChar=$true; $box.SetBounds($x,$y,145,24); $panel.Controls.Add($box); $boxes[($rows[$i][1]+'::'+$slot)]=$box
    if($ExistingSetup -and -not $providerStatusAdded.ContainsKey($providerId)) {
      $slotKey=$providerId+'::'+$slot
      $statusLabel=New-Object Windows.Forms.Label; $statusLabel.Text='Empty'; $statusLabel.SetBounds($x,($y+25),145,18); $statusLabel.AutoEllipsis=$true; $panel.Controls.Add($statusLabel)
      $statusLabels[$slotKey]=$statusLabel; $statusBase[$slotKey]='Empty'
      $replace=New-Object Windows.Forms.CheckBox; $replace.Text='Replace saved key'; $replace.SetBounds($x,($y+43),145,18); $panel.Controls.Add($replace); $replaceChecks[$slotKey]=$replace
    }
    if(-not $ExistingSetup -and $rows[$i][1] -in @('HF_TOKEN','VERCEL_AI_GATEWAY_API_KEY')) {$box.Enabled=$false; $label.Text=$rows[$i][0]+' (disabled)'}
  }
  if($ExistingSetup) {$providerStatusAdded[$providerId]=$true}
  $link=New-Object Windows.Forms.LinkLabel; $link.Text='Get key'; $link.Tag=$rows[$i][2]; $link.SetBounds(965,(3+$y),60,25)
  $link.Add_LinkClicked({param($sender,$eventArgs) Start-Process $sender.Tag}); $panel.Controls.Add($link)
}
$confirm=New-Object Windows.Forms.CheckBox
$confirm.Text='I checked free-tier/evaluation terms. Paid overages, BYOK and auto top-up are off.'
$confirm.SetBounds(15,433,1030,38); $form.Controls.Add($confirm)
$notice=New-Object Windows.Forms.Label
$notice.Text='Scroll for all 12 providers. NVIDIA/Kilo: no confidential data; evaluation use only. Vercel/HF: monthly credits. Zen: temporary free. Blank keeps saved keys. Reconnect MCP after saving.'
if(-not $ExistingSetup) {$notice.Text='12 eligible free-plan/evaluation providers. HF/Vercel credit profiles disabled. No billing, paid overages, BYOK or auto top-up. Blank keeps saved keys. Reconnect MCP after saving.'}
if($ExistingSetup) {$notice.Text+=' Saving valid keys restarts OmniRoute. “Replace saved key” overwrites only after the new key passes validation; failures keep the old key.'}
$notice.SetBounds(15,473,1030,50); $form.Controls.Add($notice)
$candidates=New-Object Windows.Forms.CheckBox
$candidates.Text='Also test Kimi K2.6 / Qwen3 Coder free candidates (up to one extra call per supplied key).'
$candidates.SetBounds(15,525,1030,35); $candidates.Enabled=(-not $ExistingSetup); $form.Controls.Add($candidates)
$save=New-Object Windows.Forms.Button; $save.Text='Validate and save'; $save.SetBounds(430,575,190,35); $form.Controls.Add($save)
$checkStatus=New-Object Windows.Forms.Button; $checkStatus.Text='Check saved key statuses'; $checkStatus.SetBounds(635,575,205,35); $checkStatus.Visible=$ExistingSetup; $form.Controls.Add($checkStatus)
$statusNote=New-Object Windows.Forms.Label; $statusNote.Text='Healthy and expired/rejected are based on the last validation; status can change.'; $statusNote.SetBounds(15,615,1030,24); $form.Controls.Add($statusNote)
if($Simple) {
  $candidates.Visible=$false
  $confirm.Text='I use free/evaluation accounts. Paid overages and auto top-up are OFF.'
  $save.Text='Save and test'
  $notice.Text='Keys are masked and saved encrypted on this PC. No text file needed. Cloudflare requires BOTH fields. Some free services are evaluation-only. Antigravity login stays in its own app.'
}
function Get-StatusText($item) {
  switch ($item.status) {
    'healthy' { return 'Healthy' }
    'unhealthy' { return 'Unhealthy' }
    'expired' { return 'Expired / rejected' }
    default { return 'Not checked' }
  }
}
function Update-SlotBadge([string]$key) {
  if(-not $statusLabels.ContainsKey($key)) {return}
  $parts=$key.Split('::'); $providerId=$parts[0]; $slot=[int]$parts[1]; $pending=$false
  foreach($row in $rows) {if($row[3] -eq $providerId -and $boxes[($row[1]+'::'+$slot)].Text.Trim()) {$pending=$true}}
  $text=$statusBase[$key]
  if($pending) {
    if($text -eq 'Empty') {$text='Not saved'}
    elseif($replaceChecks[$key].Checked) {$text+=' - replacement not saved'}
    else {$text+=' - new key not saved'}
  }
  $statusLabels[$key].Text=$text
}
function Set-StatusLabels($items) {
  foreach($key in @($statusLabels.Keys)) {$statusBase[$key]='Empty'; $statusLabels[$key].Text='Empty'}
  foreach($item in @($items)) {
    $key=$item.providerId+'::'+$item.slot
    if($statusLabels.ContainsKey($key)) {
      $text=Get-StatusText $item
      if($item.lastAttemptReasonCode -in @('QUOTA_OR_RATE_LIMIT','NETWORK_OR_ENDPOINT_TIMEOUT','NETWORK_OR_ENDPOINT_FAILURE')) {$text+=' - last check blocked'}
      $statusBase[$key]=$text; $statusLabels[$key].Text=$text
    }
  }
  foreach($key in @($statusLabels.Keys)) {Update-SlotBadge $key}
}
function Get-StatusResult([switch]$Check) {
  $info=New-Object Diagnostics.ProcessStartInfo; $info.FileName=$NodePath
  $backend=Join-Path $AppRoot 'distribution\settings.mjs'
  $info.Arguments='"'+$backend+'"'; if($Check) {$info.Arguments+=' --check-status'}else{$info.Arguments+=' --status'}
  $info.UseShellExecute=$false; $info.CreateNoWindow=$true; $info.RedirectStandardInput=$true; $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
  $info.EnvironmentVariables['OMNIROUTE_HOME']=$RuntimeRoot
  $process=New-Object Diagnostics.Process; $process.StartInfo=$info; [void]$process.Start(); $process.StandardInput.Close()
  $errorTask=$process.StandardError.ReadToEndAsync(); $outputTask=$process.StandardOutput.ReadToEndAsync()
  while(-not $process.HasExited) { [Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 100 }
  $result=$outputTask.Result | ConvertFrom-Json
  if($process.ExitCode -ne 0 -or -not $result.ready) {throw 'Provider status check failed'}
  return $result
}
foreach($key in @($statusLabels.Keys)) {
  $parts=$key.Split('::'); $providerId=$parts[0]; $slot=[int]$parts[1]
  foreach($row in $rows) {if($row[3] -eq $providerId) {$box=$boxes[($row[1]+'::'+$slot)]; $box.Tag=$key; $box.Add_TextChanged({param($sender,$eventArgs) Update-SlotBadge ([string]$sender.Tag)})}}
  $replaceChecks[$key].Tag=$key
  $replaceChecks[$key].Add_CheckedChanged({param($sender,$eventArgs) Update-SlotBadge ([string]$sender.Tag)})
  $replaceChecks[$key].Add_Click({param($sender,$eventArgs) Update-SlotBadge ([string]$sender.Tag)})
}
if($ExistingSetup -and -not $SmokeTest) {try {$initialStatus=Get-StatusResult; Set-StatusLabels $initialStatus.statuses}catch {$statusNote.Text='Saved keys are present, but their previous status could not be read.'}}
$checkStatus.Add_Click({
  $answer=[Windows.Forms.MessageBox]::Show('This sends one small request per saved key and may use provider free quota. Continue?','Check saved key status',[Windows.Forms.MessageBoxButtons]::YesNo,[Windows.Forms.MessageBoxIcon]::Information)
  if($answer -ne [Windows.Forms.DialogResult]::Yes) {return}
  $save.Enabled=$false; $checkStatus.Enabled=$false; $statusNote.Text='Checking saved keys. This can take a few minutes. No saved key will be replaced.'; $form.Refresh()
  try {$checked=Get-StatusResult -Check; Set-StatusLabels $checked.statuses; $statusNote.Text='Status updated. “Expired / rejected” means the provider rejected authentication; verify the key before replacing.'}
  catch {$statusNote.Text='Status check could not finish. The existing saved keys and previous statuses were kept.'}
  finally {$save.Enabled=$true; $checkStatus.Enabled=$true}
})
$save.Add_Click({
  if(-not $confirm.Checked) { [Windows.Forms.MessageBox]::Show('Confirm free-only account settings first.'); return }
  $save.Enabled=$false; $save.Text='Checking keys...'; $form.Refresh()
  try {
    $slots=@{}; $replaceSlots=@{}
    foreach($row in $rows) {
      $providerId=$row[3];if(-not $slots.ContainsKey($providerId)) {$slots[$providerId]=@(@{},@{},@{},@{},@{})}
      for($slot=1;$slot -le 5;$slot++) {$slots[$providerId][$slot-1][$row[1]]=$boxes[($row[1]+'::'+$slot)].Text}
    }
    foreach($key in $replaceChecks.Keys) {if($replaceChecks[$key].Checked) {$parts=$key.Split('::');$providerId=$parts[0];$slot=[int]$parts[1];if(-not $replaceSlots.ContainsKey($providerId)) {$replaceSlots[$providerId]=@()};$replaceSlots[$providerId]=@($replaceSlots[$providerId]+$slot)}}
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=$NodePath
    $backend=Join-Path $AppRoot 'distribution\settings.mjs'
    $info.Arguments='"'+$backend+'"'; $info.UseShellExecute=$false; $info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true; $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
    if($ExistingSetup) {$info.Arguments+=' --existing --restart'}
    $info.EnvironmentVariables['OMNIROUTE_HOME']=$RuntimeRoot
    $process=New-Object Diagnostics.Process; $process.StartInfo=$info; [void]$process.Start()
    $payload=@{slots=$slots;freeOnlyConfirmed=$true;validateCodingCandidates=$candidates.Checked}; if($replaceSlots.Count -gt 0) {$payload.replaceSlots=$replaceSlots}
    $process.StandardInput.Write(($payload | ConvertTo-Json -Depth 6 -Compress)); $process.StandardInput.Close()
    $errorTask=$process.StandardError.ReadToEndAsync()
    $outputTask=$process.StandardOutput.ReadToEndAsync()
    while(-not $process.HasExited) { [Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 100 }
    $result=$outputTask.Result | ConvertFrom-Json
    if($process.ExitCode -ne 0 -or -not $result.ready) { [Windows.Forms.MessageBox]::Show($result.error,'Setup needs attention'); return }
    foreach($item in @($result.slotResults | Where-Object {$_.status -in @('ACCEPTED','DUPLICATE')})) {
      $requested=$item.requestedSlot; if(-not $requested) {$requested=$item.slot}
      foreach($row in $rows) {if($row[3] -eq $item.providerId) {$boxes[($row[1]+'::'+$requested)].Clear()}}
    }
    if($result.statuses) {Set-StatusLabels $result.statuses}
    foreach($item in @($result.slotResults | Where-Object {$_.status -eq 'FAILED'})) {
      $slot=$item.requestedSlot; if(-not $slot) {$slot=$item.slot}; $key=$item.providerId+'::'+$slot
      if($statusLabels.ContainsKey($key)) {
        if($statusBase[$key] -eq 'Empty') {$statusLabels[$key].Text='Not saved - '+$item.reasonCode}
        else {$statusLabels[$key].Text=$statusBase[$key]+' - not saved ('+$item.reasonCode+')'}
      }
    }
    $slots.Clear()
    $message='Saved. Open the OmniRoute Regular desktop shortcut.'
    if($Simple) {$message='Validation finished. Restart your host or reconnect its OmniRoute MCP server to refresh providers.'}
    if($RequireReady -and -not $Simple) {$message='Saved. Next, return to the setup terminal to choose your project folder.'}
    if($ExistingSetup) {$message='Saved for your existing OmniRoute setup. Modes, port and existing keys were preserved.'}
    if($result.restartNeeded) {$message+=' Restart OmniRoute with omni service stop, then omni service start.'}
    $acceptedSlots=@($result.slotResults | Where-Object {$_.status -eq 'ACCEPTED'} | ForEach-Object {if($_.requestedSlot -and $_.requestedSlot -ne $_.slot){$_.providerId+' slot '+$_.requestedSlot+' was filled; saved to slot '+$_.slot}else{$_.providerId+' slot '+$_.slot}})
    $failedSlots=@($result.slotResults | Where-Object {$_.status -eq 'FAILED'} | ForEach-Object {if($_.requestedSlot -and $_.requestedSlot -ne $_.slot){$_.providerId+' slot '+$_.requestedSlot+' was filled; slot '+$_.slot+' could not be saved ('+$_.reasonCode+')'}else{$_.providerId+' slot '+$_.slot+' ('+$_.reasonCode+')'}})
    $duplicateSlots=@($result.slotResults | Where-Object {$_.status -eq 'DUPLICATE'} | ForEach-Object {if($_.matchedSlot){$_.providerId+' slot '+$_.slot+' duplicates saved slot '+$_.matchedSlot}else{$_.providerId+' slot '+$_.slot+' was already saved'}})
    $storedProviders=@($result.stored | ForEach-Object {$_.providerId+' ('+@($_.slots).Count+' stored)'})
    if($acceptedSlots.Count -gt 0) {$message+=[Environment]::NewLine+'Accepted and stored: '+($acceptedSlots -join ', ')+'.'}
    if($failedSlots.Count -gt 0) {$message+=[Environment]::NewLine+'Not stored: '+($failedSlots -join ', ')+'. Existing saved slots were kept.'}
    if($duplicateSlots.Count -gt 0) {$message+=[Environment]::NewLine+'Skipped duplicate keys: '+($duplicateSlots -join ', ')+'.'}
    if($storedProviders.Count -gt 0) {$message+=[Environment]::NewLine+'Currently available: '+($storedProviders -join ', ')+'.'}
    foreach($candidate in $result.codingCandidates) {$message+=[Environment]::NewLine+$candidate.provider+'/'+$candidate.model+': '+$candidate.status}
    [Windows.Forms.MessageBox]::Show($message,'Ready'); $script:setupReady=$true
    if(-not $ExistingSetup) {$form.Close()}else{$statusNote.Text='Saved keys stay in their slots. Check status or choose Replace saved key before entering a replacement.'}
  } catch { [Windows.Forms.MessageBox]::Show('Setup could not finish. Check your connection and try again. No key values were logged.','Setup error') }
  finally { $save.Enabled=$true; $save.Text='Validate and save'; if($Simple){$save.Text='Save and test'} }
})
if($SmokeTest) {
  $expected=75; if($Simple){$expected=65}
  if($boxes.Count -ne $expected -or -not $panel.AutoScroll) {throw 'Missing credential fields or scrolling'}
  if($ExistingSetup -and ($replaceChecks.Count -ne ($providerStatusAdded.Count*5) -or $checkStatus.Text -ne 'Check saved key statuses')) {throw "Existing-setup status or replace controls are missing ($($replaceChecks.Count) replace controls for $($providerStatusAdded.Count) providers)"}
  if($ExistingSetup) {
    $smokeKey=[string](@($statusLabels.Keys)[0]); $parts=$smokeKey.Split('::'); $providerId=$parts[0]; $slot=[int]$parts[1]
    $smokeBox=$null; foreach($row in $rows) {if($row[3] -eq $providerId) {$smokeBox=$boxes[($row[1]+'::'+$slot)]; break}}
    $statusBase[$smokeKey]='Healthy'; $statusLabels[$smokeKey].Text='Healthy'
    $smokeBox.Text='fixture-not-saved'; if($statusLabels[$smokeKey].Text -notmatch 'Not saved') {throw 'Unsaved credentials are not visible in slot status'}
    $replaceChecks[$smokeKey].Checked=$true; Update-SlotBadge $smokeKey
    if($statusLabels[$smokeKey].Text -notmatch 'replacement not saved') {throw 'Explicit replacement status is not visible'}
    $smokeBox.Clear(); if($statusLabels[$smokeKey].Text -ne 'Healthy') {throw 'Saved slot status did not restore'}
  }
  if($Simple -and ($boxes.ContainsKey('HF_TOKEN') -or $boxes.ContainsKey('VERCEL_AI_GATEWAY_API_KEY') -or $save.Text -ne 'Save and test')) {throw 'Simple form has unexpected controls'}
  foreach($box in $boxes.Values) {if(-not $box.UseSystemPasswordChar) {throw 'Unmasked credential field'}}
  $count=$boxes.Count; $form.Dispose(); Write-Output "PASS: masked Windows Forms key-entry controls ($count masked)"; return
}
[void]$form.ShowDialog()
if($RequireReady -and -not $script:setupReady) {exit 2}
