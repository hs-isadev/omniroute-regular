[CmdletBinding()]
param([string]$InstallRoot = $PSScriptRoot,[switch]$SmokeTest)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = New-Object Windows.Forms.Form
$form.Text = 'OmniRoute Regular - Your API keys'
$form.Size = New-Object Drawing.Size(690,590)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$intro = New-Object Windows.Forms.Label
$intro.Text = 'OpenRouter is required. Other providers are optional. Keys stay on this Windows account.'
$intro.SetBounds(15,12,650,36)
$form.Controls.Add($intro)
$rows = @(
  @('OpenRouter *','OPENROUTER_API_KEY','https://openrouter.ai/settings/keys'),
  @('Groq','GROQ_API_KEY','https://console.groq.com/keys'),
  @('Gemini','GEMINI_API_KEY','https://aistudio.google.com/apikey'),
  @('Mistral','MISTRAL_API_KEY','https://console.mistral.ai/api-keys/'),
  @('Cohere','COHERE_API_KEY','https://dashboard.cohere.com/api-keys'),
  @('Cloudflare token','CLOUDFLARE_API_TOKEN','https://dash.cloudflare.com/'),
  @('Cloudflare account ID','CLOUDFLARE_ACCOUNT_ID','https://dash.cloudflare.com/'),
  @('Hugging Face','HF_TOKEN','https://huggingface.co/settings/tokens')
)
$boxes = @{}
for ($i=0; $i -lt $rows.Count; $i++) {
  $label=New-Object Windows.Forms.Label; $label.Text=$rows[$i][0]; $label.SetBounds(15,(55+$i*42),150,25); $form.Controls.Add($label)
  $box=New-Object Windows.Forms.TextBox; $box.UseSystemPasswordChar=$true; $box.SetBounds(170,(52+$i*42),380,26); $form.Controls.Add($box); $boxes[$rows[$i][1]]=$box
  $link=New-Object Windows.Forms.LinkLabel; $link.Text='Get key'; $link.Tag=$rows[$i][2]; $link.SetBounds(570,(55+$i*42),80,25)
  $link.Add_LinkClicked({param($sender,$eventArgs) Start-Process $sender.Tag}); $form.Controls.Add($link)
}
$confirm=New-Object Windows.Forms.CheckBox
$confirm.Text='These are free-tier / evaluation accounts. Paid overages and auto top-up are off.'
$confirm.SetBounds(15,393,650,38); $form.Controls.Add($confirm)
$notice=New-Object Windows.Forms.Label
$notice.Text='Hugging Face uses limited free monthly credit; Cohere uses trial keys. Cloudflare requires both fields. Leave a field blank to keep its saved key. Close OpenCode before changing keys.'
$notice.SetBounds(15,433,650,50); $form.Controls.Add($notice)
$save=New-Object Windows.Forms.Button; $save.Text='Validate and save'; $save.SetBounds(235,492,190,35); $form.Controls.Add($save)
$save.Add_Click({
  if(-not $confirm.Checked) { [Windows.Forms.MessageBox]::Show('Confirm free-only account settings first.'); return }
  $save.Enabled=$false; $save.Text='Checking keys...'; $form.Refresh()
  try {
    $keys=@{}; foreach($name in $boxes.Keys) {$keys[$name]=$boxes[$name].Text}
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=Join-Path $InstallRoot 'node\node.exe'
    $backend=Join-Path $InstallRoot 'app\distribution\settings.mjs'
    $info.Arguments='"'+$backend+'"'; $info.UseShellExecute=$false; $info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true; $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
    $info.EnvironmentVariables['OMNIROUTE_HOME']=Join-Path $InstallRoot 'data'
    $process=New-Object Diagnostics.Process; $process.StartInfo=$info; [void]$process.Start()
    $process.StandardInput.Write((@{keys=$keys;freeOnlyConfirmed=$true} | ConvertTo-Json -Compress)); $process.StandardInput.Close()
    $errorTask=$process.StandardError.ReadToEndAsync()
    $outputTask=$process.StandardOutput.ReadToEndAsync()
    while(-not $process.HasExited) { [Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 100 }
    $result=$outputTask.Result | ConvertFrom-Json
    if(-not $result.ready) { [Windows.Forms.MessageBox]::Show($result.error,'Setup needs attention'); return }
    foreach($box in $boxes.Values) {$box.Clear()}; $keys.Clear()
    $message='Saved. Open the OmniRoute Regular desktop shortcut.'
    if($result.failed.Count -gt 0) {$message+=' Some supplied keys failed validation: '+($result.failed -join ', ')+'. Existing keys were kept. Reopen Settings to retry.'}
    [Windows.Forms.MessageBox]::Show($message,'Ready'); $form.Close()
  } catch { [Windows.Forms.MessageBox]::Show('Setup could not finish. Check your connection and try again. No key values were logged.','Setup error') }
  finally { $save.Enabled=$true; $save.Text='Validate and save' }
})
if($SmokeTest) {
  if($boxes.Count -ne 8) {throw 'Missing credential fields'}
  foreach($box in $boxes.Values) {if(-not $box.UseSystemPasswordChar) {throw 'Unmasked credential field'}}
  $form.Dispose(); Write-Output 'PASS: masked Windows Forms key-entry controls'; return
}
[void]$form.ShowDialog()
