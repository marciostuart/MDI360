' Talks to the MDI 360 server: registers the TV once, then heartbeats/syncs.
' All networking lives here because SceneGraph forbids blocking the render thread.

sub init()
    m.top.functionName = "runLoop"
end sub

function registryRead(key as string) as string
    section = CreateObject("roRegistrySection", "mdi360")
    if section.Exists(key) then return section.Read(key)
    return ""
end function

sub registryWrite(key as string, value as string)
    section = CreateObject("roRegistrySection", "mdi360")
    section.Write(key, value)
    section.Flush()
end sub

sub registryDelete(key as string)
    section = CreateObject("roRegistrySection", "mdi360")
    section.Delete(key)
    section.Flush()
end sub

' Minimal JSON POST helper. Returns { code: <http status>, body: <assocarray> }.
function postJson(url as string, token as string, bodyText as string) as object
    port = CreateObject("roMessagePort")
    transfer = CreateObject("roUrlTransfer")
    transfer.SetMessagePort(port)
    transfer.SetCertificatesFile("common:/certs/ca-bundle.crt")
    transfer.InitClientCertificates()
    transfer.SetUrl(url)
    transfer.AddHeader("Content-Type", "application/json")
    if token <> "" then transfer.AddHeader("Authorization", "Bearer " + token)
    transfer.EnableEncodings(true)

    result = { code: 0, body: invalid }
    if not transfer.AsyncPostFromString(bodyText) then return result

    msg = wait(20000, port)
    if type(msg) = "roUrlEvent"
        result.code = msg.GetResponseCode()
        parsed = ParseJson(msg.GetString())
        if parsed <> invalid then result.body = parsed
    else
        transfer.AsyncCancel()
    end if
    return result
end function

sub runLoop()
    baseUrl = m.top.baseUrl
    intervalMs = 60000

    while true
        token = registryRead("deviceToken")

        if token = ""
            m.top.statusText = "Registrando esta tela..."
            res = postJson(baseUrl + "/api/public/player/register", "", FormatJson({ appVersion: "roku-1.0.0" }))
            if res.code = 200 and res.body <> invalid and res.body.deviceToken <> invalid
                registryWrite("deviceToken", res.body.deviceToken)
                m.top.activationCode = res.body.activationCode
                m.top.statusText = ""
            else
                m.top.statusText = "Sem conexao com o servidor (HTTP " + res.code.ToStr() + ") - " + baseUrl + ". Tentando novamente..."
                sleep(5000)
            end if
        else
            res = postJson(baseUrl + "/api/public/player/sync", token, FormatJson({ appVersion: "roku-1.0.0" }))

            if res.code = 401
                ' The screen was removed from the account: forget everything and
                ' come back as a brand new TV asking for a fresh activation code.
                registryDelete("deviceToken")
                m.top.activationCode = ""
                m.top.payload = {}
            else if res.code = 200 and res.body <> invalid
                m.top.statusText = ""
                m.top.payload = res.body
                if res.body.syncIntervalMs <> invalid and res.body.syncIntervalMs > 10000
                    intervalMs = res.body.syncIntervalMs
                end if
            else
                m.top.statusText = "Sem conexao com o servidor (HTTP " + res.code.ToStr() + "). Tentando novamente..."
                sleep(10000)
            end if
            sleep(intervalMs)
        end if
    end while
end sub