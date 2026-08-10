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

    ' O servidor aceita campos nulos, mas o Roku pode serializar valores
    ' invalid de forma diferente entre versões do firmware. Envie apenas os
    ' identificadores realmente disponíveis.
    payload = { completed: true }
    if data.playlistId <> invalid and data.playlistId <> "" then
        payload.playlistId = data.playlistId
    end if
    if data.mediaAssetId <> invalid and data.mediaAssetId <> "" then
        payload.mediaAssetId = data.mediaAssetId
    end if
    if data.durationMs <> invalid then payload.durationMs = data.durationMs

    body = FormatJson(payload)

    ' PostFromString sem porta de mensagens não permite confirmar se o evento
    ' chegou ao servidor. Isso fazia o relatório desaparecer silenciosamente
    ' em Roku com Wi-Fi lento. Agora aguardamos uma resposta curta e tentamos
    ' novamente sem bloquear a cena de reprodução.
    for attempt = 1 to 3
        port = CreateObject("roMessagePort")
        transfer = CreateObject("roUrlTransfer")
        transfer.SetMessagePort(port)
        transfer.SetCertificatesFile("common:/certs/ca-bundle.crt")
        transfer.InitClientCertificates()
        transfer.SetUrl(m.top.baseUrl + "/api/public/player/playback")
        transfer.AddHeader("Content-Type", "application/json")
        transfer.AddHeader("Authorization", "Bearer " + token)

        if transfer.AsyncPostFromString(body) then
            msg = wait(10000, port)
            if type(msg) = "roUrlEvent"
                code = msg.GetResponseCode()
                if code >= 200 and code < 300 then return
            else
                transfer.AsyncCancel()
            end if
        end if

        if attempt < 3 then sleep(1000)
    end for
end sub
