# build-codepage.ps1 - regenerate scripts/codepage-repertoire.json.
#
# Why this is PowerShell and not Node: Node has no legacy-codepage encoder (Buffer only
# does utf8 / latin1 / utf16le), so the repertoire has to be measured with .NET once and
# saved as JSON. The runtime then stays zero-dependency and fully offline - the same trick
# build-s2t.js uses to keep OpenCC out of the runtime.
#
# WHY ExceptionFallback IS NOT OPTIONAL:
# .NET's default fallback REPLACES a character it cannot encode with '?' instead of
# throwing, so without it every codepage looks like it can encode everything and the table
# becomes a silent "all clear" - the exact failure mode this whole axis exists to catch.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-codepage.ps1
#
# ASCII only on purpose: powershell 5.1 reads .ps1 files as ANSI, so a literal non-ASCII
# character in here would corrupt the script itself.

$ErrorActionPreference = 'Stop'

$out = Join-Path $PSScriptRoot 'codepage-repertoire.json'

# 950 Big5 (the Windows console default that started all this), 936 GBK, 932 Shift-JIS,
# 1252 Western European, 20936 strict GB2312-80.
#
# Note the naming trap, measured 2026-09-18: Windows calls codepage 936 "gb2312", but 936 is
# really GBK - it encodes every common Traditional character too (only emoji fail). The
# STRICT GB2312-80 repertoire is 20936 (x-cp20936), which cannot encode the five common
# characters U+9AD4 U+8EDF U+6DE8 U+9EB5 U+88E1, so it fails in the opposite direction:
# a Traditional document crashes on a GB2312 console. (The code points are spelled out
# because this file has to stay ASCII - see the header. scripts/codepage-selftest.mjs
# asserts those five are missing from 20936, so the claim is checked, not just stated.)
#
# 54936 (GB18030) and 65001 (UTF-8) encode every Unicode character, so they are recorded in
# coversAll instead of shipping a table that would be pointless.
$codepages = @(950, 936, 932, 1252, 20936)
$maybeAll = @(54936, 65001)

function New-StrictEncoding([int]$cp) {
  return [System.Text.Encoding]::GetEncoding($cp,
    [System.Text.EncoderFallback]::ExceptionFallback,
    [System.Text.DecoderFallback]::ExceptionFallback)
}

# The repertoire is discovered by DECODING: every byte sequence the encoding accepts maps
# to some character, and whatever comes out is by construction what the console can print.
# Enumerating all of Unicode instead (1.1M code points, most of them invalid) would take
# minutes for no extra information.
function Get-Repertoire([int]$cp) {
  $enc = New-StrictEncoding $cp
  $seen = New-Object 'System.Collections.Generic.HashSet[int]'
  $probe = New-Object 'byte[]' 1
  for ($b = 0; $b -lt 256; $b++) {
    $probe[0] = [byte]$b
    try {
      $s = $enc.GetString($probe)
      if ($s.Length -eq 1) { [void]$seen.Add([int][char]$s) }
    } catch { }
  }
  if (-not $enc.IsSingleByte) {
    $two = New-Object 'byte[]' 2
    for ($lead = 0x81; $lead -le 0xFE; $lead++) {
      for ($trail = 0x40; $trail -le 0xFE; $trail++) {
        if ($trail -eq 0x7F) { continue }
        $two[0] = [byte]$lead
        $two[1] = [byte]$trail
        try {
          $s = $enc.GetString($two)
          if ($s.Length -eq 1) { [void]$seen.Add([int][char]$s) }
        } catch { }
      }
    }
  }
  # A decode hit is not proof that printing works: keep only what the ENCODER also accepts,
  # so the table can never claim a character is printable when printing it would throw.
  $keep = New-Object 'System.Collections.Generic.List[int]'
  foreach ($c in $seen) {
    if ($c -lt 128) { continue }
    if ($c -ge 0xD800 -and $c -le 0xDFFF) { continue }
    try {
      $null = $enc.GetBytes([string][char]$c)
      $keep.Add($c)
    } catch { }
  }
  $keep.Sort()
  $sb = New-Object System.Text.StringBuilder
  foreach ($c in $keep) { [void]$sb.Append([char]$c) }
  return $sb.ToString()
}

function Test-CoversAll([int]$cp) {
  $enc = New-StrictEncoding $cp
  # BMP, an emoji, a CJK extension B character and the last code point: enough to tell
  # "encodes all of Unicode" from "encodes the usual repertoire".
  foreach ($c in @(0x4E00, 0x952E, 0x2705, 0x1F600, 0x20000, 0x10FFFF)) {
    try {
      $null = $enc.GetBytes([char]::ConvertFromUtf32($c))
    } catch {
      return $false
    }
  }
  return $true
}

$repertoires = [ordered]@{}
foreach ($cp in $codepages) {
  $rep = Get-Repertoire $cp
  $repertoires["$cp"] = $rep
  Write-Host ("codepage {0}: {1} characters it can encode" -f $cp, $rep.Length)
}

$coversAll = @()
foreach ($cp in $maybeAll) {
  if (Test-CoversAll $cp) {
    $coversAll += "$cp"
    Write-Host ("codepage {0}: encode every Unicode character (no table needed)" -f $cp)
  } else {
    Write-Host ("codepage {0}: NOT complete - add it to the table list" -f $cp)
  }
}

$data = [ordered]@{
  '$format' = 'chinese-script-policy codepage repertoire v1'
  '$note' = 'Each value lists the characters that codepage CAN encode. A character missing from a repertoire cannot be printed to a console using that codepage - see references/console-encoding-hazard.md.'
  '$build' = 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-codepage.ps1'
  'coversAll' = $coversAll
  'repertoires' = $repertoires
}

$json = $data | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($out, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ("wrote {0} ({1} bytes)" -f $out, (Get-Item $out).Length)
