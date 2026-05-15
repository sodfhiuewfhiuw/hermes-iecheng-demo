param(
    [string]$Message = "auto update $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)

$ErrorActionPreference = "Stop"

Write-Host "Checking Git status..."

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Git is not available. Please install Git for Windows first."
    exit 1
}

$changes = git status --porcelain

if ([string]::IsNullOrWhiteSpace($changes)) {
    Write-Host "No changes to upload."
    exit 0
}

git add .
git commit -m "$Message"
git push

if ($LASTEXITCODE -eq 0) {
    Write-Host "Uploaded to GitHub successfully."
} else {
    Write-Host "Upload failed. Check GitHub login, origin, or network settings."
    exit $LASTEXITCODE
}
