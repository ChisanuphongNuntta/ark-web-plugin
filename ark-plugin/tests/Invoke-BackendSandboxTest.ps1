[CmdletBinding()]
param(
    [string]$BaseUrl = 'https://localhost/api/plugin',
    [int]$ServerId = 1,
    [switch]$SkipReplayCheck,
    [switch]$AllowInvalidLocalhostCertificate
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$secret = $env:HEARTSHOP_HMAC_SECRET
$keyId = $env:HEARTSHOP_KEY_ID
if ([string]::IsNullOrWhiteSpace($secret) -or [string]::IsNullOrWhiteSpace($keyId)) {
    throw 'Set HEARTSHOP_HMAC_SECRET and HEARTSHOP_KEY_ID to sandbox-scoped values. They are never written to disk.'
}

$baseUri = [Uri]$BaseUrl
if ($baseUri.Scheme -ne 'https') {
    throw 'Sandbox integration tests require HTTPS.'
}
if ($AllowInvalidLocalhostCertificate -and $baseUri.Host -notin @('localhost', '127.0.0.1', '::1')) {
    throw 'Invalid-certificate bypass is restricted to loopback sandbox endpoints.'
}

function ConvertTo-LowerHex {
    param([Parameter(Mandatory)][byte[]]$Bytes)
    return -join ($Bytes | ForEach-Object { $_.ToString('x2') })
}

function New-SignedHeartbeat {
    param([string]$Nonce)

    $bodyObject = [ordered]@{
        playerCount = 0
        pluginVersion = 'sandbox-smoke'
        buildSha256 = ('0' * 64)
        arkApiVersion = 'sandbox'
        capabilities = @('hmac_signatures', 'atomic_claims')
        queueDepth = 0
        circuitBreakerState = 'closed'
    }
    $body = $bodyObject | ConvertTo-Json -Compress
    $uri = [Uri]($BaseUrl.TrimEnd('/') + '/heartbeat')
    $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString()
    if ([string]::IsNullOrWhiteSpace($Nonce)) {
        $nonceBytes = New-Object byte[] 16
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($nonceBytes)
        $Nonce = ConvertTo-LowerHex -Bytes $nonceBytes
    }

    $sha = [System.Security.Cryptography.SHA256]::Create()
    $contentHash = ConvertTo-LowerHex -Bytes $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($body))
    $canonical = "POST`n$($uri.PathAndQuery)`n$timestamp`n$Nonce`n$contentHash"
    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    $hmac.Key = [Text.Encoding]::UTF8.GetBytes($secret)
    $signature = ConvertTo-LowerHex -Bytes $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($canonical))

    return [pscustomobject]@{
        Uri = $uri.AbsoluteUri
        Body = $body
        Nonce = $Nonce
        Headers = @{
            'X-Plugin-Key-Id' = $keyId
            'X-Plugin-Version' = 'sandbox-smoke'
            'X-Request-Timestamp' = $timestamp
            'X-Request-Nonce' = $Nonce
            'X-Content-SHA256' = $contentHash
            'X-Signature' = $signature
            'X-Server-Id' = [string]$ServerId
        }
    }
}

function Invoke-Heartbeat {
    param([Parameter(Mandatory)]$Request)
    return Invoke-WebRequest -Method POST -Uri $Request.Uri -Headers $Request.Headers `
        -ContentType 'application/json' -Body $Request.Body -UseBasicParsing
}

$previousCertificateCallback = [System.Net.ServicePointManager]::ServerCertificateValidationCallback
try {
    if ($AllowInvalidLocalhostCertificate) {
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    }

    $request = New-SignedHeartbeat
    $response = Invoke-Heartbeat -Request $request
    if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
        throw "Signed heartbeat returned HTTP $($response.StatusCode)"
    }
    Write-Host "PASS signed heartbeat -> HTTP $($response.StatusCode)"

    if (-not $SkipReplayCheck) {
        try {
            $null = Invoke-Heartbeat -Request $request
            throw 'Replay protection failed: the same signed nonce was accepted twice.'
        }
        catch {
            $status = if ($_.Exception.Response) {
                [int]$_.Exception.Response.StatusCode
            } else {
                0
            }
            if ($status -lt 400 -or $status -ge 500) {
                throw
            }
            Write-Host "PASS nonce replay rejected -> HTTP $status"
        }
    }
} finally {
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = $previousCertificateCallback
}

Write-Host 'Backend signed sandbox smoke test passed.'
