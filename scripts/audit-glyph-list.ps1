# Audit a glyph list against the real Windows charsets, against a baseline.
#
# WHAT IT IS FOR
# simplified-only.json must contain ONLY characters that exist in Simplified but
# NOT in Traditional Chinese. If a glyph in it can also be encoded in Big5
# (cp950, the Windows Taiwan Traditional charset), a normal Traditional document
# that uses that glyph gets reported as Simplified - and once the PreToolUse hook
# is mounted, the write is BLOCKED.
#
# That is not hypothetical: OpenCC's STCharacters normalises variant forms, so
# "peak", "bed", "silly", "secret", "stove" and "rice-dumpling" all have an entry
# where the STANDARD Taiwan glyph maps to an obscure variant. The builder
# therefore classified those standard glyphs as Simplified-only, and everyday
# words containing them ("get up", "secret", "main peak", "zongzi") were all
# reported as Simplified. The exact character list lives in THIRD-PARTY-NOTICES.md
# and in glyph-audit-baseline.json; it is deliberately NOT repeated here, because
# this file must stay pure ASCII (see the note at the bottom).
#
# WHY A BASELINE
# A plain listing is only useful once. After the 21 real false positives were
# removed, 35 Big5-encodable glyphs legitimately remain (they are the Simplified
# standard even though cp950 carries them as rare variants). Those are recorded
# by code point in glyph-audit-baseline.json. From then on this script is a
# GUARD, not a report: it exits 1 only when a glyph appears that Big5 can encode
# and the baseline has never accepted. That happens when the list is regenerated
# (new OpenCC release) or another list is added.
#
# Exit 0 = no new candidates. Exit 1 = new candidates, review them by hand.
#
# Big5-encodability is necessary, not sufficient: cp950 also carries rare variant
# glyphs that really are the Simplified standard. Big5 level 1 vs level 2 does
# not separate the two groups either. Only a human decides - which is exactly
# what the baseline records.
#
# ASCII-only on purpose: powershell.exe 5.1 reads .ps1 as ANSI.
# NOTE: never name a local variable $List here - PowerShell variable names are
# case-insensitive, so it would collide with a [string] parameter and silently
# coerce the parsed array into one joined string.
# Paths are derived from the script location, so the skill works from any
# checkout (a git clone, another user's machine) and carries no personal paths.
# NOTE: param() must stay the first statement - only comments may precede it.
param(
  [string]$Path = (Join-Path $PSScriptRoot 'simplified-only.json'),
  [string]$Baseline = (Join-Path $PSScriptRoot 'glyph-audit-baseline.json'),
  [switch]$Update,
  [switch]$All,
  [string]$Drop = ''
)

$u8 = New-Object System.Text.UTF8Encoding($false)
$big5 = [System.Text.Encoding]::GetEncoding(950, [System.Text.EncoderFallback]::ExceptionFallback, [System.Text.DecoderFallback]::ExceptionFallback)
$gbk = [System.Text.Encoding]::GetEncoding(936, [System.Text.EncoderFallback]::ExceptionFallback, [System.Text.DecoderFallback]::ExceptionFallback)

$raw = [System.IO.File]::ReadAllText($Path, $u8)
$entries = $raw | ConvertFrom-Json

function Test-Enc($enc, [string]$ch) {
  try { $null = $enc.GetBytes($ch); return $true } catch { return $false }
}
function Get-Cp([string]$ch) { return 'U+' + ([int][char]$ch).ToString('X4') }

$shared = New-Object System.Collections.ArrayList
$unknown = New-Object System.Collections.ArrayList
foreach ($ch in $entries) {
  $s = [string]$ch
  if (Test-Enc $big5 $s) { [void]$shared.Add((Get-Cp $s)) }
  elseif (-not (Test-Enc $gbk $s)) { [void]$unknown.Add((Get-Cp $s)) }
}

$accepted = @()
if (Test-Path $Baseline) {
  $accepted = @(([System.IO.File]::ReadAllText($Baseline, $u8) | ConvertFrom-Json).accepted)
}

$new = @($shared | Where-Object { $accepted -notcontains $_ })
$stale = @($accepted | Where-Object { $shared -notcontains $_ })

$dec = {
  param($cps)
  $out = foreach ($cp in $cps) { [char][System.Convert]::ToInt32($cp.Substring(2), 16) }
  return ($out -join ' ')
}

Write-Output ("file                     : {0}" -f $Path)
Write-Output ("entries                  : {0}" -f $entries.Count)
Write-Output ("Big5-encodable (shared)  : {0}   (baseline accepts {1})" -f $shared.Count, $accepted.Count)
Write-Output ("not encodable in GBK     : {0}" -f $unknown.Count)

if ($All) {
  Write-Output ("--- all shared ---")
  Write-Output (((& $dec $shared) -join '  '))
}
if ($new.Count) {
  Write-Output ("--- NEW, not in baseline (review by hand) ---")
  Write-Output ((& $dec $new) -join '  ')
  Write-Output ((($new | ForEach-Object { [char][System.Convert]::ToInt32($_.Substring(2), 16) }) -join '  '))
}
if ($stale.Count) {
  Write-Output ("--- in baseline but no longer in the list (harmless) ---")
  Write-Output ((& $dec $stale) -join '  ')
}

# Removal is deliberately explicit (-Drop "<glyphs>"): passing every shared glyph
# would also delete the reviewed exceptions, which really are the Simplified
# standard and must stay in the list. Check glyph-audit-baseline.json first.
if ($Drop) {
  $drop = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($c in $Drop.ToCharArray()) { [void]$drop.Add([string]$c) }
  $next = @($entries | Where-Object { -not $drop.Contains([string]$_) })
  [System.IO.File]::WriteAllText($Path, (ConvertTo-Json $next -Compress), $u8)
  Write-Output ("removed {0} -> {1} entries" -f ($entries.Count - $next.Count), $next.Count)
  Write-Output 'now re-run with -Update if the removals were correct'
  exit 0
}

if ($Update) {
  # Force LF: ConvertTo-Json emits CRLF on Windows, which would make this one file
  # differ from every other file in the repo (and produce a noisy diff each run).
  $json = (ConvertTo-Json @{ note = 'Glyphs that cp950 (Big5) can encode and that we deliberately KEEP in the list: they are the Simplified standard even though Big5 carries them as rare variants. Regenerate with -Update after a deliberate review.'; accepted = @($shared) }) -replace "`r`n", "`n"
  [System.IO.File]::WriteAllText($Baseline, $json, $u8)
  Write-Output ("baseline written: {0} accepted glyph(s)" -f $shared.Count)
  exit 0
}

if ($new.Count) {
  Write-Output ("RESULT: {0} new candidate(s) - decide each one by hand" -f $new.Count)
  Write-Output '        genuinely used in Traditional -> remove:  -Drop "<glyphs>"'
  Write-Output '        genuinely Simplified standard   -> keep:   -Update'
  exit 1
}
Write-Output 'RESULT: clean - every Big5-encodable glyph is a reviewed exception'
exit 0
