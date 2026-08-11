$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $projectRoot "roku"
$outputFile = Join-Path $projectRoot "mdi360-roku.zip"
$requiredFiles = @(
    "manifest",
    "source\main.brs",
    "components\PlayerScene.xml",
    "components\PlayerScene.brs",
    "images\icon_focus_fhd.png",
    "images\icon_focus_hd.png",
    "images\splash_fhd.png",
    "images\splash_hd.png"
)

foreach ($relativePath in $requiredFiles) {
    $fullPath = Join-Path $sourceRoot $relativePath
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
        throw "Arquivo obrigatorio ausente: $relativePath"
    }
}

$manifestPath = Join-Path $sourceRoot "manifest"
$manifestBytes = [System.IO.File]::ReadAllBytes($manifestPath)
if ($manifestBytes.Length -eq 0 -or $manifestBytes[-1] -ne 10) {
    throw "O manifest deve terminar com uma quebra de linha."
}

Add-Type -AssemblyName System.Drawing
$requiredImageSizes = @{
    "images\icon_focus_fhd.png" = @(540, 405)
    "images\icon_focus_hd.png" = @(290, 218)
    "images\splash_fhd.png" = @(1920, 1080)
    "images\splash_hd.png" = @(1280, 720)
}
foreach ($entry in $requiredImageSizes.GetEnumerator()) {
    $imagePath = Join-Path $sourceRoot $entry.Key
    $image = [System.Drawing.Image]::FromFile($imagePath)
    try {
        if ($image.Width -ne $entry.Value[0] -or $image.Height -ne $entry.Value[1]) {
            throw "Dimensao invalida em $($entry.Key): $($image.Width)x$($image.Height). Esperado: $($entry.Value[0])x$($entry.Value[1])."
        }
    }
    finally {
        $image.Dispose()
    }
}

$temporaryZip = Join-Path ([System.IO.Path]::GetTempPath()) "mdi360-roku-$([guid]::NewGuid().ToString('N')).zip"
try {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::Open(
        $temporaryZip,
        [System.IO.Compression.ZipArchiveMode]::Create
    )
    try {
        foreach ($directoryName in @("audio", "components", "images", "source")) {
            [void]$archive.CreateEntry("$directoryName/")
            $directoryPath = Join-Path $sourceRoot $directoryName
            foreach ($file in Get-ChildItem -LiteralPath $directoryPath -File -Recurse) {
                $relativePath = $file.FullName.Substring($sourceRoot.Length + 1).Replace("\", "/")
                [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                    $archive,
                    $file.FullName,
                    $relativePath,
                    [System.IO.Compression.CompressionLevel]::Optimal
                )
            }
        }
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            $manifestPath,
            "manifest",
            [System.IO.Compression.CompressionLevel]::Optimal
        )
    }
    finally {
        $archive.Dispose()
    }

    $archive = [System.IO.Compression.ZipFile]::OpenRead($temporaryZip)
    try {
        $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace("/", "\") })
        foreach ($relativePath in $requiredFiles) {
            if ($entries -notcontains $relativePath) {
                throw "O pacote gerado nao contem: $relativePath"
            }
        }
        if ($entries -contains "roku\manifest") {
            throw "Estrutura invalida: a pasta roku foi incluida dentro do ZIP."
        }
        foreach ($requiredDirectory in @("audio\", "components\", "images\", "source\")) {
            if ($entries -notcontains $requiredDirectory) {
                throw "O pacote nao contem o registro de diretorio exigido pela Roku: $requiredDirectory"
            }
        }
    }
    finally {
        $archive.Dispose()
    }

    Copy-Item -LiteralPath $temporaryZip -Destination $outputFile -Force
}
finally {
    Remove-Item -LiteralPath $temporaryZip -Force -ErrorAction SilentlyContinue
}

$hash = (Get-FileHash -LiteralPath $outputFile -Algorithm SHA256).Hash
Write-Output "Pacote Roku criado e validado."
Write-Output "SHA256: $hash"
