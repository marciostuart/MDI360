' Fire-and-forget playback reporting. Runs off the render thread so a slow
' network never freezes the slideshow. One short POST per item shown.

sub init()
    m.top.functionName = "runLoop"
end sub

function registryRead(key as string) as string
    section = CreateObject("roRegistrySection", "mdi360")
    if section.Exists(key) then return section.Read(key)
    return ""
end function

sub runLoop()
    port = CreateObject("roMessagePort")
    m.top.observeField("report", port)

    while true
        msg = wait(0, port)
        if type(msg) = "roSGNodeEvent"
            data = msg.getData()
            if data <> invalid then send(data)
        end if
    end while
end sub

sub send(data as object)
    token = registryRead("deviceToken")
    if token = "" then return

    body = FormatJson({
        playlistId: data.playlistId,
        mediaAssetId: data.mediaAssetId,
        durationMs: data.durationMs
    })

    transfer = CreateObject("roUrlTransfer")
    transfer.SetCertificatesFile("common:/certs/ca-bundle.crt")
    transfer.InitClientCertificates()
    transfer.SetUrl(m.top.baseUrl + "/api/public/player/playback")
    transfer.AddHeader("Content-Type", "application/json")
    transfer.AddHeader("Authorization", "Bearer " + token)
    transfer.PostFromString(body)
end sub
