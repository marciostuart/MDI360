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
    linked = false

    while true
        token = registryRead("deviceToken")

        if token = ""
            linked = false
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
        else if not linked
            ' While the screen is still unlinked the sync endpoint answers 401 by
            ' design, so we poll the status endpoint instead and keep the very
            ' same activation code on screen until someone claims it.
            res = postJson(baseUrl + "/api/public/player/status", token, "{}")

            if res.code = 401
                ' Row removed in the Studio: forget the token and register again.
                registryDelete("deviceToken")
                m.top.activationCode = ""
                m.top.payload = {}
            else if res.code = 200 and res.body <> invalid
                state = ""
                if res.body.state <> invalid then state = res.body.state
                if state = "linked"
                    linked = true
                    m.top.statusText = "Tela vinculada. Carregando conteudo..."
                else if state = "blocked"
                    m.top.activationCode = ""
                    m.top.statusText = "Tela bloqueada. Fale com o suporte."
                    sleep(30000)
                else
                    if res.body.activationCode <> invalid and res.body.activationCode <> ""
                        m.top.activationCode = res.body.activationCode
                    end if
                    m.top.statusText = ""
                    sleep(10000)
                end if
            else
                m.top.statusText = "Sem conexao com o servidor (HTTP " + res.code.ToStr() + "). Tentando novamente..."
                sleep(10000)
            end if
        else
            res = postJson(baseUrl + "/api/public/player/sync", token, FormatJson({ appVersion: "roku-1.0.0" }))

            if res.code = 401
                ' Unlinked or removed in the Studio: go back to the waiting loop,
                ' which decides between keeping the code or registering again.
                linked = false
                m.top.payload = {}
            else if res.code = 200 and res.body <> invalid
                m.top.statusText = ""
                m.top.payload = res.body
                if res.body.syncIntervalMs <> invalid and res.body.syncIntervalMs > 10000
                    intervalMs = res.body.syncIntervalMs
                end if
                sleep(intervalMs)
            else
                m.top.statusText = "Sem conexao com o servidor (HTTP " + res.code.ToStr() + "). Tentando novamente..."
                sleep(10000)
            end if
        end if
    end while
end sub