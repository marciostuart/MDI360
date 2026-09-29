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
' timeoutMs is generous for the long-poll channel, which the server holds open.
function postJson(url as string, token as string, bodyText as string, timeoutMs = 20000 as integer) as object
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

    msg = wait(timeoutMs, port)
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
    revision = 0
    ' First status check of a waiting cycle is instant; the rest long-poll.
    m.firstStatus = true

    ' Give the network stack a moment to initialize on cold boot before the
    ' first register call. This avoids transient DNS failures right after
    ' the channel launches.
    sleep(1500)

    while true
        token = registryRead("deviceToken")

        if token = ""
            linked = false
            m.top.activationCode = ""
            m.top.statusText = "Gerando codigo de ativacao..."
            res = postJson(baseUrl + "/api/public/player/register", "", FormatJson({ appVersion: "roku-1.1.22" }))
            if res.code = 200 and res.body <> invalid and res.body.deviceToken <> invalid and res.body.activationCode <> invalid
                registryWrite("deviceToken", res.body.deviceToken)
                m.top.activationCode = res.body.activationCode
                m.top.statusText = "Codigo: " + res.body.activationCode
                m.firstStatus = true
            else
                m.top.statusText = "Falha ao registrar (HTTP " + res.code.ToStr() + "). Tentando em 5s..."
                sleep(5000)
            end if
        else if not linked
            ' While the screen is still unlinked the sync endpoint answers 401 by
            ' design, so we poll the status endpoint instead and keep the very
            ' same activation code on screen until someone claims it.
            ' Push mode: the first check is instant, every following one holds the
            ' request open (~25s) and returns the moment the Studio claims or
            ' replaces this screen, so linking is immediate.
            statusBody = "{""wait"":true}"
            if m.firstStatus <> false then statusBody = "{""wait"":false}"
            m.firstStatus = false
            res = postJson(baseUrl + "/api/public/player/status", token, statusBody, 35000)

            if res.code = 401
                ' Row removed in the Studio: forget the token and register again.
                registryDelete("deviceToken")
                m.top.activationCode = ""
                m.top.payload = {}
                m.top.statusText = "Tela removida. Gerando novo codigo..."
                m.firstStatus = true
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
                    ' Keep showing the same code; only overwrite it if the server
                    ' actually returns a different one (should not happen while pending).
                    if res.body.activationCode <> invalid and res.body.activationCode <> ""
                        m.top.activationCode = res.body.activationCode
                    end if
                    m.top.statusText = "Aguardando vinculacao..."
                end if
            else
                m.top.statusText = "Sem conexao (HTTP " + res.code.ToStr() + "). Reconectando..."
                sleep(10000)
            end if
        else
            res = postJson(baseUrl + "/api/public/player/sync", token, FormatJson({ appVersion: "roku-1.1.22" }))

            if res.code = 401
                ' Unlinked or removed in the Studio: go back to the waiting loop,
                ' which decides between keeping the code or registering again.
                linked = false
                m.firstStatus = true
                m.top.payload = {}
                m.top.statusText = "Tela desvinculada."
            else if res.code = 200 and res.body <> invalid
                m.top.statusText = ""
                m.top.payload = res.body
                if res.body.revision <> invalid then revision = res.body.revision
                if res.body.syncIntervalMs <> invalid and res.body.syncIntervalMs > 10000
                    intervalMs = res.body.syncIntervalMs
                end if

                ' Push channel: hold one request open; the server answers the
                ' moment the Studio changes anything for this screen. If nothing
                ' happens it returns after ~25s and we simply reopen it, which
                ' doubles as the periodic heartbeat without hammering the VPS.
                waited = 0
                while waited < intervalMs
                    evt = postJson(baseUrl + "/api/public/player/events", token, FormatJson({ revision: revision }), 35000)
                    if evt.code = 401
                        linked = false
                        m.top.payload = {}
                        exit while
                    else if evt.code = 200 and evt.body <> invalid
                        if evt.body.revision <> invalid then revision = evt.body.revision
                        if evt.body.changed = true then exit while
                        waited = waited + 25000
                    else
                        ' Channel unavailable (proxy, rede): fall back to polling.
                        sleep(10000)
                        waited = waited + 10000
                    end if
                end while
            else
                m.top.statusText = "Sem conexao (HTTP " + res.code.ToStr() + "). Reconectando..."
                sleep(10000)
            end if
        end if
    end while
end sub
