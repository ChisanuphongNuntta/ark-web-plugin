[CmdletBinding()]
param(
    [string]$BaseUrl = 'https://localhost/api/plugin',
    [int]$ServerId = 1
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$apiKey = $env:HEARTSHOP_API_KEY
if ([string]::IsNullOrWhiteSpace($apiKey)) {
    throw 'Set HEARTSHOP_API_KEY to a scoped sandbox plugin credential. The test never writes it to disk.'
}

$uri = [Uri]$BaseUrl
if ($uri.Scheme -ne 'https') {
    throw 'Sandbox integration tests require HTTPS.'
}

$headers = @{
    'X-API-Key' = $apiKey
    'X-Server-Id' = [string]$ServerId
}

function Invoke-SandboxRequest {
    param(
        [Parameter(Mandatory)][ValidateSet('GET', 'POST')][string]$Method,
        [Parameter(Mandatory)][string]$Path,
        [hashtable]$Body
    )

    $request = @{
        Method = $Method
        Uri = $BaseUrl.TrimEnd('/') + $Path
        Headers = $headers
        UseBasicParsing = $true
    }
    if ($null -ne $Body) {
        $request.ContentType = 'application/json'
        $request.Body = $Body | ConvertTo-Json -Compress
    }

    $response = Invoke-WebRequest @request
    if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
        throw "$Method $Path returned HTTP $($response.StatusCode)"
    }
    Write-Host "PASS $Method $Path -> HTTP $($response.StatusCode)"
}

# Read-only authentication/contract checks plus an operational heartbeat.
# Delivery completion and P2P mutation are intentionally excluded: those
# require fixtures issued by the backend sandbox lease contract.
Invoke-SandboxRequest -Method GET -Path '/verify'
Invoke-SandboxRequest -Method GET -Path '/orders/pending'
Invoke-SandboxRequest -Method GET -Path '/market/plugin/deliveries'
Invoke-SandboxRequest -Method POST -Path '/heartbeat' -Body @{ playerCount = 0 }

Write-Host 'Backend sandbox smoke test passed.'
